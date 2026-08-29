import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, IsNull, Repository } from 'typeorm';
import { BiometricPunchEntity } from './entities/biometric-punch.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { IngestPunchItemDto } from './biometric.dto';

const STANDARD_HOURS = 9;
const DEFAULT_BUSINESS_TZ_OFFSET_MIN = 330;

export interface IngestResult {
  received: number;
  inserted: number;
  duplicates: number;
  unknownEmployees: string[];
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
  ) {}

  /** Insert raw punches (idempotent on (client, code, time, device)). */
  async ingest(
    clientId: string,
    items: IngestPunchItemDto[],
    autoProcess: boolean,
    manager?: EntityManager,
  ): Promise<IngestResult> {
    const punchRepo =
      manager?.getRepository(BiometricPunchEntity) ?? this.punchRepo;
    const empRepo = manager?.getRepository(EmployeeEntity) ?? this.empRepo;

    const result: IngestResult = {
      received: items.length,
      inserted: 0,
      duplicates: 0,
      unknownEmployees: [],
      attendanceUpserts: 0,
      affectedDays: [],
    };

    if (!items.length) return result;

    // Resolve employees by code (one round-trip)
    const codes = Array.from(
      new Set(items.map((i) => (i.employeeCode || '').trim()).filter(Boolean)),
    );
    const emps = await empRepo.find({
      where: { clientId, employeeCode: In(codes) },
    });
    const byCode = new Map<string, EmployeeEntity>();
    emps.forEach((e) => byCode.set(e.employeeCode, e));

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
      const allMobile = dayPunches.every(
        (p) =>
          p.source === ('MOBILE_KIOSK' as any) ||
          p.source === ('MOBILE_ESS' as any),
      );
      const captureMethod: AttendanceEntity['captureMethod'] = allMobile
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
      if (err?.code !== '23505' && err?.driverError?.code !== '23505') throw err;
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
