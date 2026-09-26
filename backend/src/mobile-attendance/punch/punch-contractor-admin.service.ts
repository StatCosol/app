import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { ContractorBiometricPunchEntity } from './contractor-punch.entity';

/** Manual punches and FaceDesk web punches both carry this device id. */
const NO_DEVICE = '00000000-0000-0000-0000-000000000000';

export type ContractorPunchSource = 'FACE' | 'MANUAL' | 'DEVICE';

/**
 * Where a punch came from. The table has no source column, and the device id
 * cannot say it alone: manual punches and FaceDesk web punches share the
 * all-zero id. A face punch always carries face evidence (a match, a model, a
 * photo); a manual one carries none; anything else came from a device.
 */
export function contractorPunchSource(p: {
  deviceId: string | null;
  matchScore?: unknown;
  matchCosine?: unknown;
  embeddingModel?: unknown;
  photoUrl?: unknown;
}): ContractorPunchSource {
  const has = (v: unknown) => v !== null && v !== undefined && v !== '';
  if (
    has(p.matchScore) ||
    has(p.matchCosine) ||
    has(p.embeddingModel) ||
    has(p.photoUrl)
  )
    return 'FACE';
  if (!p.deviceId || p.deviceId === NO_DEVICE) return 'MANUAL';
  return 'DEVICE';
}

/** The row the Contractor Attendance screen reads (ContractorPunchRow). */
export interface ContractorPunchRow {
  id: string;
  contractorEmployeeId: string;
  contractorEmployeeName: string | null;
  employeeCode: string | null;
  contractorUserId: string | null;
  contractorName: string | null;
  branchId: string | null;
  punchTime: Date;
  direction: string;
  source: ContractorPunchSource;
  deviceId: string | null;
  photoUrl: string | null;
  matchScore: number | null;
  livenessScore: number | null;
  captureLat: number | null;
  captureLng: number | null;
  decision: string;
}

/** An option in the screen's Contractor dropdown. */
export interface ContractorForBranchRow {
  contractorUserId: string;
  contractorName: string | null;
  contractorEmail: string | null;
  employeeCount: string;
}

export interface ContractorAttendanceExport {
  buffer: Buffer;
  fileName: string;
}

/**
 * A branch user's scope: null for everyone else. Manual punches were saved
 * with no branch, so the employee's branch stands in for a missing one.
 */
type BranchScope = string[] | null | undefined;

@Injectable()
export class PunchContractorAdminService {
  constructor(
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
  ) {}

  /**
   * This returned bare punch rows. The screen was built for rows carrying the
   * employee and contractor names and a source, so the Employee column read
   * "-" for everyone; with no source its "manual punches only" guard never
   * fired and face punches could be edited and deleted; and FaceDesk stores
   * its score as match_cosine, so Match was blank for every FaceDesk punch.
   * It also ignored a branch user's branches on a page titled "your branch".
   */
  async listContractorPunches(
    clientId: string,
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      contractorEmployeeId?: string;
      contractorUserId?: string;
      limit?: number;
    } = {},
    branchScope?: BranchScope,
  ): Promise<ContractorPunchRow[]> {
    if (branchScope && !branchScope.length) return [];
    const qb = this.contractorPunchRepo
      .createQueryBuilder('p')
      .leftJoin('contractor_employees', 'ce', 'ce.id = p.contractorEmployeeId')
      .leftJoin('users', 'cu', 'cu.id = ce.contractor_user_id')
      .addSelect([
        'ce.name AS "ceName"',
        'ce.employee_code AS "ceCode"',
        'ce.contractor_user_id AS "ceContractorUserId"',
        'ce.branch_id AS "ceBranchId"',
        'cu.name AS "cuName"',
      ])
      .where('p.clientId = :clientId', { clientId })
      .orderBy('p.punchTime', 'DESC');

    if (opts.from) qb.andWhere('p.punchTime >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('p.punchTime <= :to', { to: opts.to });
    if (opts.branchId)
      qb.andWhere('COALESCE(p.branchId, ce.branch_id) = :branchId', {
        branchId: opts.branchId,
      });
    if (branchScope)
      qb.andWhere('COALESCE(p.branchId, ce.branch_id) IN (:...branchScope)', {
        branchScope,
      });
    if (opts.contractorEmployeeId)
      qb.andWhere('p.contractorEmployeeId = :contractorEmployeeId', {
        contractorEmployeeId: opts.contractorEmployeeId,
      });
    if (opts.contractorUserId)
      qb.andWhere(
        'ce.client_id = :clientId AND ce.contractor_user_id = :contractorUserId',
        { contractorUserId: opts.contractorUserId },
      );
    if (opts.limit) qb.limit(opts.limit);

    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((p, i) => {
      const r = raw[i] ?? {};
      return {
        id: p.id,
        contractorEmployeeId: p.contractorEmployeeId,
        contractorEmployeeName: r.ceName ?? null,
        employeeCode: r.ceCode ?? null,
        contractorUserId: r.ceContractorUserId ?? null,
        contractorName: r.cuName ?? null,
        branchId: p.branchId ?? r.ceBranchId ?? null,
        punchTime: p.punchTime,
        direction: p.direction,
        source: contractorPunchSource(p),
        deviceId: p.deviceId,
        photoUrl: p.photoUrl,
        matchScore: p.matchScore ?? p.matchCosine ?? null,
        livenessScore: p.livenessScore,
        captureLat: p.captureLat,
        captureLng: p.captureLng,
        decision: p.decision,
      };
    });
  }

  async exportContractorAttendance(
    clientId: string,
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      contractorEmployeeId?: string;
      contractorUserId?: string;
    } = {},
    branchScope?: BranchScope,
  ): Promise<ContractorAttendanceExport> {
    const punches = await this.listContractorPunches(
      clientId,
      { ...opts, limit: undefined },
      branchScope,
    );
    const rows = this.toAttendanceExportRows(punches);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'StatCo';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Contractor Attendance');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Contractor', key: 'contractor', width: 28 },
      { header: 'Employee Code', key: 'employeeCode', width: 16 },
      { header: 'Employee Name', key: 'employeeName', width: 28 },
      { header: 'In Time', key: 'inTime', width: 12 },
      { header: 'Out Time', key: 'outTime', width: 12 },
      { header: 'Hours', key: 'hours', width: 10 },
      { header: 'Punches', key: 'punches', width: 10 },
      { header: 'Source', key: 'source', width: 12 },
      { header: 'Match %', key: 'match', width: 10 },
      { header: 'Liveness %', key: 'liveness', width: 12 },
      { header: 'Photo Evidence', key: 'photoEvidence', width: 18 },
      { header: 'Punch IDs', key: 'punchIds', width: 42 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center' };

    rows.forEach((row) => sheet.addRow(row));
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const contractorName =
      rows[0]?.contractor || opts.contractorUserId || 'contractor';
    const rangeLabel =
      `${this.safeFilePart(opts.from?.slice(0, 10) || 'from')}-to-` +
      `${this.safeFilePart(opts.to?.slice(0, 10) || 'to')}`;
    return {
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: `contractor-attendance-${this.safeFilePart(contractorName)}-${rangeLabel}.xlsx`,
    };
  }

  /**
   * The contractors to choose from, named from the users table.
   *
   * The screen used to build this list in the browser: it fetched every
   * contractor employee of the branch, grouped them by contractor id, and
   * labelled each group with the name of whichever employee came back first.
   * So the Contractor dropdown read "Jilkari Shiva Kumar - 74 emp" — one of
   * the 74, not the contractor — while the table below it, which joins users,
   * showed the contractor's real name.
   */
  async listContractorsForBranch(
    clientId: string,
    opts: { branchId?: string } = {},
    branchScope?: BranchScope,
  ): Promise<ContractorForBranchRow[]> {
    if (branchScope && !branchScope.length) return [];
    const params: unknown[] = [clientId];
    const where = [
      'ce.client_id = $1',
      'ce.is_active = true',
      'ce.contractor_user_id IS NOT NULL',
    ];
    if (opts.branchId) {
      params.push(opts.branchId);
      where.push(`ce.branch_id = $${params.length}`);
    }
    if (branchScope) {
      params.push(branchScope);
      where.push(`ce.branch_id = ANY($${params.length}::uuid[])`);
    }
    return this.contractorPunchRepo.query(
      `SELECT ce.contractor_user_id AS "contractorUserId",
              u.name              AS "contractorName",
              u.email             AS "contractorEmail",
              COUNT(*)::text      AS "employeeCount"
         FROM contractor_employees ce
         LEFT JOIN users u ON u.id = ce.contractor_user_id
        WHERE ${where.join(' AND ')}
        GROUP BY ce.contractor_user_id, u.name, u.email
        ORDER BY u.name NULLS LAST`,
      params,
    );
  }

  async createContractorPunch(
    clientId: string,
    body: {
      contractorEmployeeId: string;
      punchTime: string;
      direction: 'IN' | 'OUT' | 'AUTO';
    },
    branchScope?: BranchScope,
  ): Promise<{ ok: true; id: string }> {
    // The employee was taken on trust: any id, of any company, and the punch
    // saved with no branch. It must be this client's employee — and a branch
    // user's — and the punch takes the employee's branch.
    const [employee] = await this.contractorPunchRepo.query(
      `SELECT branch_id FROM contractor_employees
        WHERE id = $1 AND client_id = $2`,
      [body.contractorEmployeeId, clientId],
    );
    if (!employee) throw new NotFoundException('Contractor employee not found');
    this.assertBranch(employee.branch_id, branchScope);

    const punch = await this.contractorPunchRepo.save({
      clientId,
      branchId: employee.branch_id ?? null,
      deviceId: NO_DEVICE,
      contractorEmployeeId: body.contractorEmployeeId,
      direction: body.direction,
      punchTime: new Date(body.punchTime),
      offlineSync: false,
    });
    return { ok: true, id: punch.id };
  }

  async updateContractorPunch(
    clientId: string,
    id: string,
    body: { punchTime?: string; direction?: string },
    branchScope?: BranchScope,
  ): Promise<{ ok: true; id: string; punchTime: string; direction: string }> {
    const punch = await this.findManual(clientId, id, branchScope, 'edited');

    if (body.punchTime) punch.punchTime = new Date(body.punchTime);
    if (body.direction)
      punch.direction = body.direction as 'IN' | 'OUT' | 'AUTO';

    const saved = await this.contractorPunchRepo.save(punch);
    return {
      ok: true,
      id: saved.id,
      punchTime: saved.punchTime.toISOString(),
      direction: saved.direction,
    };
  }

  async deleteContractorPunch(
    clientId: string,
    id: string,
    branchScope?: BranchScope,
  ): Promise<{ ok: true; deleted: number }> {
    await this.findManual(clientId, id, branchScope, 'deleted');
    const result = await this.contractorPunchRepo.delete({ id, clientId });
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Contractor punch not found');
    }
    return { ok: true, deleted: result.affected };
  }

  /**
   * A face or device punch is evidence: it is reviewed in FaceDesk, not
   * rewritten here. The screen said so, but its check read a `source` this
   * endpoint never sent, so it never fired — and the server did not check.
   */
  private async findManual(
    clientId: string,
    id: string,
    branchScope: BranchScope,
    verb: string,
  ): Promise<ContractorBiometricPunchEntity> {
    const punch = await this.contractorPunchRepo.findOne({
      where: { id, clientId },
    });
    if (!punch) throw new NotFoundException('Contractor punch not found');
    if (branchScope) {
      const [emp] = await this.contractorPunchRepo.query(
        `SELECT branch_id FROM contractor_employees WHERE id = $1`,
        [punch.contractorEmployeeId],
      );
      this.assertBranch(punch.branchId ?? emp?.branch_id ?? null, branchScope);
    }
    if (contractorPunchSource(punch) !== 'MANUAL')
      throw new BadRequestException(
        `Only manually entered punches can be ${verb}. Face and device punches are reviewed in FaceDesk.`,
      );
    return punch;
  }

  private assertBranch(branchId: string | null, branchScope: BranchScope) {
    if (!branchScope) return;
    if (!branchId || !branchScope.includes(branchId))
      throw new NotFoundException('Contractor punch not found');
  }

  private toAttendanceExportRows(rows: ContractorPunchRow[]) {
    const groups = new Map<string, ContractorPunchRow[]>();
    for (const punch of rows) {
      const key = `${punch.contractorEmployeeId}|${this.dayKey(punch.punchTime)}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(punch);
      groups.set(key, bucket);
    }

    return Array.from(groups.values())
      .map((group) => {
        const sorted = [...group].sort(
          (a, b) =>
            new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime(),
        );
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const inPunch = sorted.find((p) => p.direction === 'IN') ?? first;
        const outPunch =
          [...sorted].reverse().find((p) => p.direction === 'OUT') ??
          (sorted.length > 1 ? last : null);
        return {
          date: this.dayKey(first.punchTime),
          contractor: first.contractorName ?? '',
          employeeCode: first.employeeCode ?? '',
          employeeName: first.contractorEmployeeName ?? 'Unknown employee',
          inTime: this.timeValue(inPunch?.punchTime ?? null),
          outTime: this.timeValue(outPunch?.punchTime ?? null),
          hours: this.hoursBetween(
            inPunch?.punchTime ?? null,
            outPunch?.punchTime ?? null,
          ),
          punches: sorted.length,
          source: this.sourceLabel(last.source),
          match: this.percentValue(last.matchScore),
          liveness: this.percentValue(last.livenessScore),
          photoEvidence: sorted.some((p) => !!p.photoUrl)
            ? 'Available in app'
            : '',
          punchIds: sorted.map((p) => p.id).join(', '),
          sortDate: first.punchTime,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime() ||
          String(a.employeeName).localeCompare(String(b.employeeName)),
      )
      .map(({ sortDate: _sortDate, ...row }) => row);
  }

  private dayKey(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private timeValue(value: Date | null): string {
    if (!value) return '';
    const hour = `${value.getHours()}`.padStart(2, '0');
    const minute = `${value.getMinutes()}`.padStart(2, '0');
    return `${hour}:${minute}`;
  }

  private hoursBetween(start: Date | null, end: Date | null): string {
    if (!start || !end) return '';
    const ms = end.getTime() - start.getTime();
    if (!Number.isFinite(ms) || ms <= 0) return '';
    return Number(ms / 36e5).toFixed(2);
  }

  private percentValue(value: number | null): number | string {
    if (value === null || value === undefined) return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return Number((n * 100).toFixed(0));
  }

  private sourceLabel(source: ContractorPunchSource): string {
    switch (source) {
      case 'FACE':
        return 'Face';
      case 'MANUAL':
        return 'Manual';
      case 'DEVICE':
        return 'Device';
      default:
        return '';
    }
  }

  private safeFilePart(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'contractor'
    );
  }
}
