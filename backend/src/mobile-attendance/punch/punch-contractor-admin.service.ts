import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
}
