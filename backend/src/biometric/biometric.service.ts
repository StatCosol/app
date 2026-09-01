import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, IsNull, Repository } from 'typeorm';
import { BiometricPunchEntity } from './entities/biometric-punch.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { ContractorEmployeeEntity } from '../contractor/contractor-employees/entities/contractor-employee.entity';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import { IngestPunchItemDto } from './biometric.dto';

const STANDARD_HOURS = 9;
const DEFAULT_BUSINESS_TZ_OFFSET_MIN = 330;

/**
 * The device a push arrived from.
 *
 * One machine enrols on-roll staff and contractor workers together, so it
 * carries no population of its own — who a punch belongs to is decided by the
 * punched code. `contractorUserId` is an optional narrowing for a machine that
 * genuinely serves a single contractor.
 */
export interface DeviceSubject {
  /** `biometric_devices.id` — contractor punches are keyed on the uuid, not the serial. */
  id: string;
  contractorUserId: string | null;
}

export interface IngestResult {
  received: number;
  inserted: number;
  duplicates: number;
  /** User IDs that matched nobody — recoverable via reconcile. */
  unknownEmployees: string[];
  /**
   * Contractor User IDs that matched more than one worker. Deliberately left
   * unattributed: picking one would post hours to the wrong contractor's wage
   * bill. Fix by making the codes unique, then reconcile.
   */
  ambiguousEmployees: string[];
  attendanceUpserts: number;
  affectedDays: { employeeId: string; date: string }[];
}

export interface ProcessResult {
  punchesScanned: number;
  attendanceUpserts: number;
  affectedDays: { employeeId: string; date: string }[];
}

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  constructor(
    @InjectRepository(BiometricPunchEntity)
    private readonly punchRepo: Repository<BiometricPunchEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attRepo: Repository<AttendanceEntity>,
    @InjectRepository(ContractorEmployeeEntity)
    private readonly contractorEmpRepo: Repository<ContractorEmployeeEntity>,
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
  ) {}

  /** Insert raw punches (idempotent on (client, code, time, device)). */
  async ingest(
    clientId: string,
    items: IngestPunchItemDto[],
    autoProcess: boolean,
    manager?: EntityManager,
    device?: DeviceSubject,
  ): Promise<IngestResult> {
    // One machine enrols everybody on a site — on-roll staff and every
    // contractor's workers alike — so who a punch belongs to is decided by the
    // punched code, never by the device. Split the batch first, then let each
    // population take its own path: employees roll up into attendance_records,
    // contractor workers do not.
    //
    // Callers that pass no device (FaceDesk, the authenticated ingest API)
    // resolve employees only, exactly as before.
    if (device) {
      const split = await this.splitBySubject(clientId, items, device, manager);

      // Codes matching more than one person are attributed to nobody, but the
      // punch is still recorded so it shows in the feed and can be recovered
      // once the codes are made unique. Dropping it would lose the shift.
      const ambiguousInserted = split.ambiguousItems.length
        ? await this.insertUnattributed(clientId, split.ambiguousItems, manager)
        : 0;

      if (split.contractorItems.length) {
        const contractorResult = await this.ingestContractor(
          clientId,
          split.contractorItems,
          split.workerByCode,
          device,
          manager,
        );
        const employeeResult = split.employeeItems.length
          ? await this.ingest(
              clientId,
              split.employeeItems,
              autoProcess,
              manager,
              undefined,
            )
          : null;
        return {
          received: items.length,
          inserted:
            contractorResult.inserted +
            (employeeResult?.inserted ?? 0) +
            ambiguousInserted,
          duplicates:
            contractorResult.duplicates + (employeeResult?.duplicates ?? 0),
          unknownEmployees: employeeResult?.unknownEmployees ?? [],
          ambiguousEmployees: split.ambiguous,
          attendanceUpserts: employeeResult?.attendanceUpserts ?? 0,
          affectedDays: employeeResult?.affectedDays ?? [],
        };
      }
      // Nothing contractor-bound; fall through to the employee path, but keep
      // any codes that were ambiguous across the two populations.
      if (split.ambiguous.length) {
        const employeeResult = await this.ingest(
          clientId,
          split.employeeItems,
          autoProcess,
          manager,
          undefined,
        );
        return {
          ...employeeResult,
          received: items.length,
          inserted: employeeResult.inserted + ambiguousInserted,
          ambiguousEmployees: split.ambiguous,
        };
      }
    }

    const punchRepo =
      manager?.getRepository(BiometricPunchEntity) ?? this.punchRepo;
    const empRepo = manager?.getRepository(EmployeeEntity) ?? this.empRepo;

    const result: IngestResult = {
      received: items.length,
      inserted: 0,
      duplicates: 0,
      unknownEmployees: [],
      // Permanent employee codes are unique per client, so ambiguity cannot
      // arise on this path.
      ambiguousEmployees: [],
      attendanceUpserts: 0,
      affectedDays: [],
    };

    if (!items.length) return result;

    // Resolve employees by code (one round-trip)
    const codes = Array.from(
      new Set(items.map((i) => (i.employeeCode || '').trim()).filter(Boolean)),
    );
    // The machine allocates its own User ID at enrolment, recorded against the
    // person as `punch_code`, so that is what a punch usually carries. The HR
    // `employee_code` is the fallback, for sites that type it in instead and
    // for callers that pass codes straight through (FaceDesk, the ingest API).
    const emps = await empRepo.find({
      where: [
        { clientId, punchCode: In(codes) },
        { clientId, employeeCode: In(codes) },
      ] as any,
    });
    const byCode = new Map<string, EmployeeEntity>();
    // Punch code first so it is never shadowed by someone else's HR code.
    emps.forEach((e) => {
      const pc = (e.punchCode ?? '').trim();
      if (pc) byCode.set(pc, e);
    });
    emps.forEach((e) => {
      if (!byCode.has(e.employeeCode)) byCode.set(e.employeeCode, e);
    });

    const unknown = new Set<string>();
    const toInsert: Partial<BiometricPunchEntity>[] = [];
    const affectedKeys = new Set<string>(); // `${empId}|${dateIso}`

    for (const it of items) {
      const code = (it.employeeCode || '').trim();
      if (!code) continue;
      const emp = byCode.get(code);
      if (!emp) {
        unknown.add(code);
        // still insert with employeeId=null so it can be reconciled later
      }

      const ts = new Date(it.punchTime);
      if (isNaN(ts.getTime())) continue;

      const requestedSource = (
        it as IngestPunchItemDto & {
          source?: BiometricPunchEntity['source'];
        }
      ).source;
      toInsert.push({
        clientId,
        branchId: emp?.branchId ?? it.branchId ?? null,
        employeeId: emp?.id ?? null,
        employeeCode: code,
        punchTime: ts,
        direction: it.direction ?? 'AUTO',
        deviceId: it.deviceId ?? null,
        source: requestedSource ?? 'DEVICE',
        rawPayload: { ...it },
      });

      if (emp) {
        affectedKeys.add(`${emp.id}|${this.toBusinessDateIso(ts)}`);
      }
    }

    // Insert with ON CONFLICT DO NOTHING for idempotency
    if (toInsert.length) {
      const insert = await punchRepo
        .createQueryBuilder()
        .insert()
        .into(BiometricPunchEntity)
        .values(toInsert as any)
        .orIgnore() // uses unique index uq_biometric_punches_dedupe
        .execute();
      result.inserted = insert.identifiers.filter(Boolean).length;
      result.duplicates = toInsert.length - result.inserted;
    }

    result.unknownEmployees = Array.from(unknown);
    result.affectedDays = Array.from(affectedKeys).map((k) => {
      const [employeeId, date] = k.split('|');
      return { employeeId, date };
    });

    if (autoProcess && result.affectedDays.length) {
      const proc = await this.processAffectedDays(
        clientId,
        result.affectedDays,
        manager,
      );
      result.attendanceUpserts = proc.attendanceUpserts;
    }

    return result;
  }

  /**
   * Backfill eligible FaceDesk punches that have not reached the shared
   * biometric pipeline yet. This closes the gap for punches captured before
   * real-time FaceDesk ingest was enabled, while leaving mismatches in the
   * review queue until a branch user approves or reassigns them.
   */
  async syncFaceDeskRange(
    clientId: string,
    from: string,
    to: string,
  ): Promise<IngestResult> {
    const rows = await this.punchRepo.manager.query<
      Array<{
        employeeCode: string;
        punchTime: Date;
        punchType: 'IN' | 'OUT' | 'AUTO';
        deviceId: string | null;
        branchId: string | null;
      }>
    >(
      `SELECT e.employee_code AS "employeeCode", a.punch_time AS "punchTime",
              a.punch_type AS "punchType", a.device_id AS "deviceId",
              a.branch_id AS "branchId"
         FROM facedesk_attendance_logs a
         JOIN employees e ON e.id = a.employee_id AND e.client_id = a.client_id
        WHERE a.client_id = $1 AND a.punch_time >= $2 AND a.punch_time <= $3
          AND a.attendance_status IN ('MARKED','APPROVED')
          AND NOT EXISTS (
            SELECT 1 FROM facedesk_attendance_review_queue rq
             WHERE rq.client_id = a.client_id
               AND rq.attendance_id = a.attendance_id
               AND rq.status = 'PENDING'
          )
          AND NOT EXISTS (
            SELECT 1 FROM biometric_punches bp
             WHERE bp.client_id = a.client_id
               AND bp.employee_code = e.employee_code
               AND bp.punch_time = a.punch_time
               AND COALESCE(bp.device_id, '') =
                   COALESCE(a.device_id::text, 'facedesk')
          )
        ORDER BY a.punch_time ASC
        LIMIT 10000`,
      [clientId, this.businessDateStartUtc(from), this.businessDateEndUtc(to)],
    );

    return this.ingest(
      clientId,
      rows.map((row) => ({
        employeeCode: row.employeeCode,
        punchTime: new Date(row.punchTime).toISOString(),
        direction: row.punchType,
        deviceId: row.deviceId ?? 'facedesk',
        branchId: row.branchId ?? undefined,
        source: 'MOBILE_KIOSK',
      })),
      false,
    );
  }

  /** List raw punches for a window. */
  async list(params: {
    clientId: string;
    from: string;
    to: string;
    branchId?: string;
    employeeId?: string;
    deviceId?: string;
  }): Promise<BiometricPunchEntity[]> {
    const where: Record<string, unknown> = { clientId: params.clientId };
    if (params.branchId) where.branchId = params.branchId;
    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.deviceId) where.deviceId = params.deviceId;
    where.punchTime = Between(
      this.businessDateStartUtc(params.from),
      this.businessDateEndUtc(params.to),
    );
    return this.punchRepo.find({
      where: where as any,
      order: { punchTime: 'ASC' },
      take: 5000,
    });
  }

  /** Recompute attendance for every (employee,date) in a window. */
  async processRange(
    clientId: string,
    from: string,
    to: string,
    reprocess: boolean,
  ): Promise<ProcessResult> {
    const where: Record<string, unknown> = {
      clientId,
      punchTime: Between(
        this.businessDateStartUtc(from),
        this.businessDateEndUtc(to),
      ),
    };
    if (!reprocess) where.processedAt = IsNull();

    const punches = await this.punchRepo.find({ where: where as any });
    const keys = new Set<string>();
    for (const p of punches) {
      if (!p.employeeId) continue;
      keys.add(`${p.employeeId}|${this.toBusinessDateIso(p.punchTime)}`);
    }
    const affected = Array.from(keys).map((k) => {
      const [employeeId, date] = k.split('|');
      return { employeeId, date };
    });
    const proc = await this.processAffectedDays(clientId, affected);
    return {
      punchesScanned: punches.length,
      attendanceUpserts: proc.attendanceUpserts,
      affectedDays: affected,
    };
  }

  /**
   * Record punches that could not be attributed to anyone, with both subject
   * ids null. They appear in the Punch Feed as unlinked and are picked up by
   * reconcile once the underlying code clash is resolved.
   */
  private async insertUnattributed(
    clientId: string,
    items: IngestPunchItemDto[],
    manager?: EntityManager,
  ): Promise<number> {
    const punchRepo =
      manager?.getRepository(BiometricPunchEntity) ?? this.punchRepo;

    const rows: Partial<BiometricPunchEntity>[] = [];
    for (const it of items) {
      const code = (it.employeeCode || '').trim();
      if (!code) continue;
      const ts = new Date(it.punchTime);
      if (isNaN(ts.getTime())) continue;
      rows.push({
        clientId,
        branchId: it.branchId ?? null,
        employeeId: null,
        contractorEmployeeId: null,
        employeeCode: code,
        punchTime: ts,
        direction: it.direction ?? 'AUTO',
        deviceId: it.deviceId ?? null,
        source: 'DEVICE',
        rawPayload: { ...it },
      });
    }
    if (!rows.length) return 0;

    const insert = await punchRepo
      .createQueryBuilder()
      .insert()
      .into(BiometricPunchEntity)
      .values(rows as any)
      .orIgnore()
      .execute();
    return insert.identifiers.filter(Boolean).length;
  }

  /**
   * Work out who each punched code identifies.
   *
   * The machine allocates its own User ID at enrolment and that number is
   * recorded against the person as `punch_code`, so that is what a punch
   * carries. `employee_code` is the HR code and is only a fallback, for sites
   * that instead type the HR code into the machine.
   *
   * A single machine enrols on-roll staff and contractor workers together, so
   * both tables are searched. A code found in both, or held by two people in
   * one table, is left unattributed rather than guessed — guessing would post
   * one contractor's hours onto another's wage bill, and the mistake would
   * surface as a payment rather than an error.
   */
  private async splitBySubject(
    clientId: string,
    items: IngestPunchItemDto[],
    device: DeviceSubject,
    manager?: EntityManager,
  ): Promise<{
    employeeItems: IngestPunchItemDto[];
    contractorItems: IngestPunchItemDto[];
    workerByCode: Map<string, ContractorEmployeeEntity>;
    ambiguousItems: IngestPunchItemDto[];
    ambiguous: string[];
  }> {
    const empRepo = manager?.getRepository(EmployeeEntity) ?? this.empRepo;
    const contractorEmpRepo =
      manager?.getRepository(ContractorEmployeeEntity) ??
      this.contractorEmpRepo;

    const codes = Array.from(
      new Set(items.map((i) => (i.employeeCode || '').trim()).filter(Boolean)),
    );
    const empty = {
      employeeItems: items,
      contractorItems: [] as IngestPunchItemDto[],
      workerByCode: new Map<string, ContractorEmployeeEntity>(),
      ambiguousItems: [] as IngestPunchItemDto[],
      ambiguous: [] as string[],
    };
    if (!codes.length) return empty;

    // A device may optionally be pinned to one contractor; otherwise search
    // every contractor belonging to this client.
    const scope: Record<string, unknown> = device.contractorUserId
      ? { clientId, contractorUserId: device.contractorUserId }
      : { clientId };
    const [staff, workers] = await Promise.all([
      empRepo.find({
        where: [
          { clientId, punchCode: In(codes) },
          { clientId, employeeCode: In(codes) },
        ] as any,
      }),
      contractorEmpRepo.find({
        where: [
          { ...scope, punchCode: In(codes) },
          { ...scope, employeeCode: In(codes) },
        ] as any,
      }),
    ]);

    const bucket = <T>(
      map: Map<string, T[]>,
      code: string | null | undefined,
      row: T,
    ) => {
      const key = (code ?? '').trim();
      if (!key) return;
      const found = map.get(key);
      if (found) found.push(row);
      else map.set(key, [row]);
    };

    const staffByPunch = new Map<string, EmployeeEntity[]>();
    const staffByHr = new Map<string, EmployeeEntity[]>();
    for (const e of staff) {
      bucket(staffByPunch, e.punchCode, e);
      bucket(staffByHr, e.employeeCode, e);
    }
    const workerByPunch = new Map<string, ContractorEmployeeEntity[]>();
    const workerByHr = new Map<string, ContractorEmployeeEntity[]>();
    for (const w of workers) {
      bucket(workerByPunch, w.punchCode, w);
      bucket(workerByHr, w.employeeCode, w);
    }

    const contractorCodes = new Set<string>();
    const ambiguous = new Set<string>();
    const workerByCode = new Map<string, ContractorEmployeeEntity>();

    for (const code of codes) {
      // Punch code is the machine's own identity and outranks the HR code, so
      // it is resolved first across both populations.
      let staffHits = staffByPunch.get(code) ?? [];
      let workerHits = workerByPunch.get(code) ?? [];
      if (!staffHits.length && !workerHits.length) {
        staffHits = staffByHr.get(code) ?? [];
        workerHits = workerByHr.get(code) ?? [];
      }

      const total = staffHits.length + workerHits.length;
      if (total > 1) {
        ambiguous.add(code);
        continue;
      }
      if (workerHits.length === 1) {
        contractorCodes.add(code);
        workerByCode.set(code, workerHits[0]);
      }
      // A single staff hit, or none at all, stays on the employee path — which
      // already records an unmatched code as unknown for later reconcile.
    }

    if (!contractorCodes.size && !ambiguous.size) return empty;

    const employeeItems: IngestPunchItemDto[] = [];
    const contractorItems: IngestPunchItemDto[] = [];
    const ambiguousItems: IngestPunchItemDto[] = [];
    for (const it of items) {
      const code = (it.employeeCode || '').trim();
      if (contractorCodes.has(code)) contractorItems.push(it);
      else if (ambiguous.has(code)) ambiguousItems.push(it);
      else employeeItems.push(it);
    }

    if (ambiguous.size) {
      this.logger.warn(
        `device ${device.id}: ${ambiguous.size} punch code(s) match more than ` +
          `one person and were left unattributed — ${Array.from(ambiguous).join(', ')}. ` +
          `Punch codes must be unique across employees and contractor workers.`,
      );
    }

    return {
      employeeItems,
      contractorItems,
      workerByCode,
      ambiguousItems,
      ambiguous: Array.from(ambiguous),
    };
  }

  /**
   * Contractor-bound punches, already resolved to workers by splitBySubject.
   *
   * Contractor attendance does not live in `attendance_records`, so nothing
   * rolls up here — the punches are the record, and the muster sheet is
   * derived from them per wage period.
   */
  private async ingestContractor(
    clientId: string,
    items: IngestPunchItemDto[],
    byCode: Map<string, ContractorEmployeeEntity>,
    device: DeviceSubject,
    manager?: EntityManager,
  ): Promise<IngestResult> {
    const punchRepo =
      manager?.getRepository(BiometricPunchEntity) ?? this.punchRepo;
    const contractorPunchRepo =
      manager?.getRepository(ContractorBiometricPunchEntity) ??
      this.contractorPunchRepo;

    const result: IngestResult = {
      received: items.length,
      inserted: 0,
      duplicates: 0,
      unknownEmployees: [],
      ambiguousEmployees: [],
      attendanceUpserts: 0,
      affectedDays: [],
    };
    if (!items.length) return result;

    const unknown = new Set<string>();
    const rawRows: Partial<BiometricPunchEntity>[] = [];
    const contractorRows: Partial<ContractorBiometricPunchEntity>[] = [];

    for (const it of items) {
      const code = (it.employeeCode || '').trim();
      if (!code) continue;
      const ts = new Date(it.punchTime);
      if (isNaN(ts.getTime())) continue;

      const worker = byCode.get(code);
      if (!worker) unknown.add(code);

      // Always keep the raw trail, matched or not, so the Punch Feed shows
      // what the machine sent and reconcile can pick it up later.
      rawRows.push({
        clientId,
        branchId: worker?.branchId ?? it.branchId ?? null,
        employeeId: null,
        contractorEmployeeId: worker?.id ?? null,
        employeeCode: code,
        punchTime: ts,
        direction: it.direction ?? 'AUTO',
        deviceId: it.deviceId ?? null,
        source: 'DEVICE',
        rawPayload: { ...it },
      });

      if (worker) {
        contractorRows.push({
          clientId,
          branchId: worker.branchId ?? null,
          deviceId: device.id,
          contractorEmployeeId: worker.id,
          direction: it.direction ?? 'AUTO',
          punchTime: ts,
          decision: 'AUTO',
        });
      }
    }

    if (rawRows.length) {
      const insert = await punchRepo
        .createQueryBuilder()
        .insert()
        .into(BiometricPunchEntity)
        .values(rawRows as any)
        .orIgnore()
        .execute();
      result.inserted = insert.identifiers.filter(Boolean).length;
      result.duplicates = rawRows.length - result.inserted;
    }

    // Replays of the device's buffered log must not double-count a shift, so
    // this leans on uq_contractor_punches_device_dedupe exactly as the
    // employee table leans on its own dedupe index.
    if (contractorRows.length) {
      await contractorPunchRepo
        .createQueryBuilder()
        .insert()
        .into(ContractorBiometricPunchEntity)
        .values(contractorRows as any)
        .orIgnore()
        .execute();
    }

    result.unknownEmployees = Array.from(unknown);
    return result;
  }

  /** Try to resolve any punches with employeeId IS NULL (e.g. employee added later). */
  async reconcileUnknown(clientId: string): Promise<{ resolved: number }> {
    const orphans = await this.punchRepo.find({
      where: { clientId, employeeId: IsNull() } as any,
      take: 5000,
    });
    if (!orphans.length) return { resolved: 0 };
    const codes = Array.from(new Set(orphans.map((o) => o.employeeCode)));
    const emps = await this.empRepo.find({
      where: { clientId, employeeCode: In(codes) },
    });
    const byCode = new Map<string, EmployeeEntity>();
    emps.forEach((e) => byCode.set(e.employeeCode, e));

    let resolved = 0;
    const affectedKeys = new Set<string>();
    for (const p of orphans) {
      const e = byCode.get(p.employeeCode);
      if (!e) continue;
      p.employeeId = e.id;
      p.branchId = e.branchId ?? null;
      affectedKeys.add(`${e.id}|${this.toBusinessDateIso(p.punchTime)}`);
      resolved++;
    }
    if (resolved) {
      await this.punchRepo.save(orphans.filter((p) => p.employeeId));
      const affected = Array.from(affectedKeys).map((k) => {
        const [employeeId, date] = k.split('|');
        return { employeeId, date };
      });
      await this.processAffectedDays(clientId, affected);
    }
    return { resolved };
  }

  // ── Internal ───────────────────────────────────────────────

  /** For each (employee,date), aggregate punches into one attendance row. */
  private async processAffectedDays(
    clientId: string,
    days: { employeeId: string; date: string }[],
    manager?: EntityManager,
  ): Promise<{ attendanceUpserts: number }> {
    if (!days.length) return { attendanceUpserts: 0 };

    const punchRepo =
      manager?.getRepository(BiometricPunchEntity) ?? this.punchRepo;
    const empRepo = manager?.getRepository(EmployeeEntity) ?? this.empRepo;
    const attRepo = manager?.getRepository(AttendanceEntity) ?? this.attRepo;

    let upserts = 0;
    for (const { employeeId, date } of days) {
      const dayStart = this.businessDateStartUtc(date);
      const dayEnd = this.businessDateEndUtc(date);

      const dayPunches = await punchRepo.find({
        where: {
          clientId,
          employeeId,
          punchTime: Between(dayStart, dayEnd),
        } as any,
        order: { punchTime: 'ASC' },
      });

      if (!dayPunches.length) continue;

      const earliest = dayPunches[0];
      const latest = dayPunches[dayPunches.length - 1];
      const explicitIn = dayPunches.find((p) => p.direction === 'IN');
      const explicitOut = [...dayPunches]
        .reverse()
        .find((p) => p.direction === 'OUT');

      // Prefer explicit direction from face/ESS/fingerprint devices. Fall back
      // to earliest/latest for legacy AUTO-only devices.
      const checkInTime = explicitIn?.punchTime ?? earliest.punchTime;
      const checkOutTime =
        explicitOut && explicitOut.punchTime.getTime() > checkInTime.getTime()
          ? explicitOut.punchTime
          : dayPunches.length > 1 &&
              latest.punchTime.getTime() > checkInTime.getTime()
            ? latest.punchTime
            : null;

      let workedHours = 0;
      if (checkOutTime) {
        const diffMs = checkOutTime.getTime() - checkInTime.getTime();
        workedHours = Math.max(0, diffMs / (1000 * 60 * 60));
      }
      const overtimeHours = Math.max(0, workedHours - STANDARD_HOURS);

      const emp = await empRepo.findOne({
        where: { id: employeeId, clientId },
      });
      if (!emp) continue;

      let existing = await attRepo.findOne({
        where: { employeeId, date },
      });

      const checkInStr = this.toTimeStr(checkInTime);
      const checkOutStr = checkOutTime ? this.toTimeStr(checkOutTime) : null;

      // Mobile face-kiosk punches share this rollup, but we tag captureMethod
      // as FACE so the UI can distinguish them from fingerprint biometric.
      //
      // Any face punch in the day is enough. A face match is probabilistic and
      // must reach the review queue, so a fingerprint/card punch from a second
      // device (an eSSL machine at the gate, say) must not clear that flag for
      // the whole day — which is what requiring *every* punch to be a kiosk
      // punch used to do, silently auto-approving the face match into payroll.
      const hasFacePunch = dayPunches.some(
        (p) =>
          p.source === ('MOBILE_KIOSK' as any) ||
          p.source === ('MOBILE_ESS' as any),
      );
      const captureMethod: AttendanceEntity['captureMethod'] = hasFacePunch
        ? 'FACE'
        : 'BIOMETRIC';
      const requiresAttendanceReview = captureMethod === 'FACE';

      if (existing) {
        // Only overwrite if existing was BIOMETRIC or empty — preserve manual edits
        if (existing.source === 'MANUAL' && existing.checkIn) {
          // Manual entry takes priority — skip
          continue;
        }
        existing.status = 'PRESENT';
        existing.checkIn = checkInStr;
        existing.checkOut = checkOutStr;
        existing.workedHours = workedHours.toFixed(2);
        existing.overtimeHours = overtimeHours.toFixed(2);
        existing.source = 'BIOMETRIC';
        existing.captureMethod = captureMethod;
        if (requiresAttendanceReview) {
          existing.approvalStatus = 'PENDING';
          existing.approvedByUserId = null;
          existing.approvedAt = null;
          existing.rejectionReason = null;
        }
        await attRepo.save(existing);
      } else {
        // Read-then-insert race. This reconcile runs from GET handlers
        // (attendance/daily and attendance/daily/stats), which the UI fires
        // concurrently for the same client and date. Both can find no row and
        // both INSERT, and the loser hits the unique index — surfacing to the
        // browser as a 409 on a plain read, because the exception filter maps
        // Postgres 23505 to Conflict.
        //
        // Adopt the row the winner created and fall through to the same update
        // the `existing` branch would have applied, so the outcome does not
        // depend on which request got there first.
        existing = await this.insertOrAdoptAttendance(attRepo, {
          clientId,
          branchId: emp.branchId,
          employeeId,
          employeeCode: emp.employeeCode,
          date,
          status: 'PRESENT',
          checkIn: checkInStr,
          checkOut: checkOutStr,
          workedHours: workedHours.toFixed(2),
          overtimeHours: overtimeHours.toFixed(2),
          source: 'BIOMETRIC',
          captureMethod,
          approvalStatus: requiresAttendanceReview ? 'PENDING' : 'APPROVED',
        } as Partial<AttendanceEntity>);
        // A manual entry won the race and was left intact — skip exactly as the
        // non-racing path does, so the punches are not linked to a row this
        // reconcile did not write.
        if (!existing) continue;
      }

      // Mark punches as processed and link attendance row
      const ids = dayPunches.map((p) => p.id);
      await punchRepo
        .createQueryBuilder()
        .update(BiometricPunchEntity)
        .set({ processedAt: new Date(), attendanceId: existing.id })
        .where('id IN (:...ids)', { ids })
        .execute();

      upserts++;
    }

    return { attendanceUpserts: upserts };
  }

  private toBusinessDateIso(d: Date): string {
    const local = new Date(
      d.getTime() + DEFAULT_BUSINESS_TZ_OFFSET_MIN * 60 * 1000,
    );
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day = String(local.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Insert an attendance row, tolerating a concurrent insert of the same day.
   *
   * The reconcile runs from read endpoints that the UI calls in parallel, so
   * two requests can both see no row and both insert. Postgres rejects the
   * loser with 23505, which the global filter turns into a 409 — a plain GET
   * appearing to "conflict". Adopting the winner's row is correct rather than
   * merely quiet: both requests computed the same rollup from the same punches.
   */
  private async insertOrAdoptAttendance(
    attRepo: Repository<AttendanceEntity>,
    fields: Partial<AttendanceEntity>,
  ): Promise<AttendanceEntity | null> {
    try {
      return await attRepo.save(attRepo.create(fields));
    } catch (err: any) {
      if (err?.code !== '23505' && err?.driverError?.code !== '23505')
        throw err;
      const winner = await attRepo.findOne({
        where: {
          employeeId: fields.employeeId as string,
          date: fields.date as any,
        },
      });
      if (!winner) throw err;
      // The row that won the race may be a MANUAL entry — markAttendance or an
      // admin edit can land between our lookup and our insert. The non-racing
      // path refuses to touch those (`source === 'MANUAL' && checkIn` → skip),
      // and adopting must honour the same rule: merging here would silently
      // replace a human's status, times and approval state with biometric
      // values, and then link the punches to the row it just overwrote.
      if (winner.source === 'MANUAL' && winner.checkIn) {
        this.logger.warn(
          `attendance reconcile raced on ${fields.employeeCode ?? fields.employeeId} ${String(fields.date)} — a manual entry won, leaving it untouched`,
        );
        return null;
      }
      this.logger.warn(
        `attendance reconcile raced on ${fields.employeeCode ?? fields.employeeId} ${String(fields.date)} — adopting the concurrently created row`,
      );
      return attRepo.save(attRepo.merge(winner, fields));
    }
  }

  private toTimeStr(d: Date): string {
    const local = new Date(
      d.getTime() + DEFAULT_BUSINESS_TZ_OFFSET_MIN * 60 * 1000,
    );
    const h = String(local.getUTCHours()).padStart(2, '0');
    const m = String(local.getUTCMinutes()).padStart(2, '0');
    const s = String(local.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  private businessDateStartUtc(date: string): Date {
    return new Date(
      new Date(`${date}T00:00:00.000Z`).getTime() -
        DEFAULT_BUSINESS_TZ_OFFSET_MIN * 60 * 1000,
    );
  }

  private businessDateEndUtc(date: string): Date {
    return new Date(
      new Date(`${date}T23:59:59.999Z`).getTime() -
        DEFAULT_BUSINESS_TZ_OFFSET_MIN * 60 * 1000,
    );
  }
}
