import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Repository } from 'typeorm';
import { BiometricPunchEntity } from './entities/biometric-punch.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { IngestPunchItemDto } from './biometric.dto';

const STANDARD_HOURS = 9;

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
  ): Promise<IngestResult> {
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
    const emps = await this.empRepo.find({
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

      toInsert.push({
        clientId,
        branchId: emp?.branchId ?? null,
        employeeId: emp?.id ?? null,
        employeeCode: code,
        punchTime: ts,
        direction: it.direction ?? 'AUTO',
        deviceId: it.deviceId ?? null,
        source: 'DEVICE',
        rawPayload: { ...it },
      });

      if (emp) {
        affectedKeys.add(`${emp.id}|${this.toDateIso(ts)}`);
      }
    }

    // Insert with ON CONFLICT DO NOTHING for idempotency
    if (toInsert.length) {
      const insert = await this.punchRepo
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
      const proc = await this.processAffectedDays(clientId, result.affectedDays);
      result.attendanceUpserts = proc.attendanceUpserts;
    }

    return result;
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
      new Date(`${params.from}T00:00:00.000Z`),
      new Date(`${params.to}T23:59:59.999Z`),
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
        new Date(`${from}T00:00:00.000Z`),
        new Date(`${to}T23:59:59.999Z`),
      ),
    };
    if (!reprocess) where.processedAt = IsNull();

    const punches = await this.punchRepo.find({ where: where as any });
    const keys = new Set<string>();
    for (const p of punches) {
      if (!p.employeeId) continue;
      keys.add(`${p.employeeId}|${this.toDateIso(p.punchTime)}`);
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
      affectedKeys.add(`${e.id}|${this.toDateIso(p.punchTime)}`);
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
  ): Promise<{ attendanceUpserts: number }> {
    if (!days.length) return { attendanceUpserts: 0 };

    let upserts = 0;
    for (const { employeeId, date } of days) {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);

      const dayPunches = await this.punchRepo.find({
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

      // If only one punch, treat it as check-in only (workedHours = 0)
      const checkInTime = earliest.punchTime;
      const checkOutTime =
        dayPunches.length > 1 ? latest.punchTime : null;

      let workedHours = 0;
      if (checkOutTime) {
        const diffMs = checkOutTime.getTime() - checkInTime.getTime();
        workedHours = Math.max(0, diffMs / (1000 * 60 * 60));
      }
      const overtimeHours = Math.max(0, workedHours - STANDARD_HOURS);

      const emp = await this.empRepo.findOne({
        where: { id: employeeId, clientId },
      });
      if (!emp) continue;

      let existing = await this.attRepo.findOne({
        where: { employeeId, date },
      });

      const checkInStr = this.toTimeStr(checkInTime);
      const checkOutStr = checkOutTime ? this.toTimeStr(checkOutTime) : null;

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
        existing.captureMethod = 'BIOMETRIC';
        await this.attRepo.save(existing);
      } else {
        existing = await this.attRepo.save(
          this.attRepo.create({
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
            captureMethod: 'BIOMETRIC',
          } as Partial<AttendanceEntity>),
        );
      }

      // Mark punches as processed and link attendance row
      const ids = dayPunches.map((p) => p.id);
      await this.punchRepo
        .createQueryBuilder()
        .update(BiometricPunchEntity)
        .set({ processedAt: new Date(), attendanceId: existing.id })
        .where('id IN (:...ids)', { ids })
        .execute();

      upserts++;
    }

    return { attendanceUpserts: upserts };
  }

  private toDateIso(d: Date): string {
    // Use UTC date (matches how dayStart/dayEnd are computed)
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private toTimeStr(d: Date): string {
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}
