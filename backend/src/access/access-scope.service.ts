import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import {
  ClientAssignment,
  AssignmentStatus,
} from '../assignments/entities/client-assignment.entity';
import { BranchAuditorAssignmentEntity } from '../assignments/entities/branch-auditor-assignment.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { BranchEntity } from '../branches/entities/branch.entity';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Shape of req.user set by JwtStrategy.validate() */
export interface ReqUser {
  id: string;
  userId: string;
  roleCode: string;
  email: string;
  clientId: string | null;
  userType: string | null;
  employeeId: string | null;
  branchIds: string[];
  assignedClientIds: string[];
}

export interface ScopeResult {
  /** all  = ADMIN/CEO/CCO — no filter needed
   *  clients = CRM/AUDITOR/PAYDEK — restrict to clientIds[]
   *  client  = CLIENT (MASTER) — single clientId
   *  branches = CLIENT (BRANCH) / BRANCH_DESK — clientId + branchIds
   */
  level: 'all' | 'clients' | 'client' | 'branches';
  clientIds?: string[];
  clientId?: string;
  branchIds?: string[];
}

/** Dropdown item shapes matching frontend ClientOption / BranchOption */
export interface ClientOption {
  id: string;
  clientName: string;
}
export interface BranchOption {
  id: string;
  branchName: string;
  branchType?: string;
  stateCode?: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

/** Roles that see the whole dataset */
const GLOBAL_ROLES = ['ADMIN', 'CEO', 'CCO', 'PAYROLL'];

@Injectable()
export class AccessScopeService {
  constructor(
    @InjectRepository(ClientAssignment)
    private readonly caRepo: Repository<ClientAssignment>,
    @InjectRepository(BranchAuditorAssignmentEntity)
    private readonly _baaRepo: Repository<BranchAuditorAssignmentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  /* ── Scope resolution ────────────────────────────────────────── */

  async getScope(user: ReqUser): Promise<ScopeResult> {
    const { roleCode, clientId, branchIds } = user;

    if (GLOBAL_ROLES.includes(roleCode)) {
      return { level: 'all' };
    }

    if (roleCode === 'CRM' || roleCode === 'PAYDEK') {
      const assignments = await this.caRepo.find({
        where: { crmUserId: user.id, status: AssignmentStatus.ACTIVE },
        select: ['clientId'],
      });
      return {
        level: 'clients',
        clientIds: assignments.map((a) => a.clientId),
      };
    }

    if (roleCode === 'AUDITOR') {
      const assignments = await this.caRepo.find({
        where: { auditorUserId: user.id, status: AssignmentStatus.ACTIVE },
        select: ['clientId'],
      });
      return {
        level: 'clients',
        clientIds: assignments.map((a) => a.clientId),
      };
    }

    if (roleCode === 'CLIENT') {
      if (!clientId) throw new ForbiddenException('No client linked to user');
      if (user.userType === 'BRANCH') {
        return {
          level: 'branches',
          clientId,
          branchIds: branchIds ?? [],
        };
      }
      // MASTER or default — all branches for this client
      return { level: 'client', clientId };
    }

    if (roleCode === 'BRANCH_DESK') {
      if (!clientId) throw new ForbiddenException('No client linked to user');
      return {
        level: 'branches',
        clientId,
        branchIds: branchIds ?? [],
      };
    }

    if (roleCode === 'CONTRACTOR') {
      if (!clientId) throw new ForbiddenException('No client linked to user');
      return { level: 'client', clientId };
    }

    if (roleCode === 'EMPLOYEE') {
      if (!clientId) throw new ForbiddenException('No client linked to user');
      return { level: 'client', clientId };
    }

    throw new ForbiddenException(
      `Role "${roleCode}" is not supported for access scoping`,
    );
  }

  /* ── Client options (for FilterBar dropdowns) ────────────────── */

  async listAllowedClients(user: ReqUser): Promise<ClientOption[]> {
    const scope = await this.getScope(user);

    const qb = this.clientRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.clientName'])
      .where('c.isActive = :active', { active: true })
      .andWhere('c.isDeleted = :del', { del: false });

    if (scope.level === 'clients') {
      if (!scope.clientIds?.length) return [];
      qb.andWhere('c.id IN (:...ids)', { ids: scope.clientIds });
    } else if (scope.level === 'client' || scope.level === 'branches') {
      qb.andWhere('c.id = :cid', { cid: scope.clientId });
    }
    // 'all' → no extra filter

    qb.orderBy('c.clientName', 'ASC');
    return qb.getMany();
  }

  /* ── Branch options (for FilterBar dropdowns) ────────────────── */

  async listAllowedBranches(
    user: ReqUser,
    clientId?: string,
  ): Promise<BranchOption[]> {
    const scope = await this.getScope(user);
    const cid = clientId ?? scope.clientId;

    // If no clientId can be resolved and scope isn't global, nothing to show
    if (!cid && scope.level !== 'all' && scope.level !== 'clients') {
      return [];
    }

    const qb = this.branchRepo
      .createQueryBuilder('b')
      .select([
        'b.id',
        'b.branchName',
        'b.branchType',
        'b.stateCode',
        'b.clientId',
      ])
      .where('b.isActive = :active', { active: true })
      .andWhere('b.isDeleted = :del', { del: false });

    if (cid) {
      qb.andWhere('b.clientId = :cid', { cid });
    } else if (scope.level === 'clients' && scope.clientIds?.length) {
      qb.andWhere('b.clientId IN (:...ids)', { ids: scope.clientIds });
    }

    // BRANCH / BRANCH_DESK — restrict to assigned branches
    if (scope.level === 'branches' && scope.branchIds?.length) {
      qb.andWhere('b.id IN (:...bids)', { bids: scope.branchIds });
    }

    qb.orderBy('b.branchName', 'ASC');
    const rows = await qb.getMany();
    return rows.map((b) => ({
      id: b.id,
      branchName: b.branchName ?? '',
      branchType: b.branchType ?? '',
      stateCode: (b as any).stateCode ?? '',
    }));
  }

  /* ── Convenience helpers for controllers/services ────────────── */

  /** Pick the right clientId: user.clientId (locked roles) or query param */
  resolveClientId(user: ReqUser, queryClientId?: string): string | null {
    if (user.clientId) return user.clientId; // CLIENT / BRANCH_DESK
    return queryClientId ?? null;
  }

  /**
   * Pick the right branchId.
   * BRANCH_DESK / CLIENT(BRANCH) with a single branch → auto-lock.
   * Otherwise use the query param.
   */
  resolveBranchId(user: ReqUser, queryBranchId?: string): string | null {
    if (
      user.branchIds?.length === 1 &&
      (user.roleCode === 'BRANCH_DESK' || user.userType === 'BRANCH')
    ) {
      return user.branchIds[0];
    }
    return queryBranchId ?? null;
  }

  /** Throws ForbiddenException if the user cannot operate on this client */
  async assertClientAllowed(user: ReqUser, clientId: string): Promise<void> {
    const scope = await this.getScope(user);
    if (scope.level === 'all') return;

    if (scope.level === 'client' || scope.level === 'branches') {
      if (scope.clientId !== clientId) {
        throw new ForbiddenException('Client not in scope');
      }
      return;
    }

    if (scope.level === 'clients') {
      if (!scope.clientIds?.includes(clientId)) {
        throw new ForbiddenException('Client not assigned to you');
      }
    }
  }

  /** Throws ForbiddenException if the user cannot operate on this branch */
  async assertBranchAllowed(user: ReqUser, branchId: string): Promise<void> {
    const scope = await this.getScope(user);
    if (scope.level === 'all') return;

    if (scope.level === 'branches') {
      if (!scope.branchIds?.includes(branchId)) {
        throw new ForbiddenException('Branch not in scope');
      }
      return;
    }

    // For 'clients' and 'client' levels — check the branch's parent client
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isActive: true, isDeleted: false },
      select: ['id', 'clientId'],
    });
    if (!branch) throw new ForbiddenException('Branch not found');
    await this.assertClientAllowed(user, branch.clientId);
  }

  /* ── QueryBuilder scope helper ───────────────────────────────── */

  /**
   * Apply scope constraints to any TypeORM QueryBuilder.
   * @param qb       The query builder to constrain
   * @param scope    Result from getScope()
   * @param opts.clientPath  Property path for clientId (default 't.clientId')
   * @param opts.branchPath  Property path for branchId (default 't.branchId')
   */
  applyToQb<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    scope: ScopeResult,
    opts?: { clientPath?: string; branchPath?: string },
  ): void {
    const cp = opts?.clientPath ?? 't.clientId';
    const bp = opts?.branchPath ?? 't.branchId';

    if (scope.level === 'all') return;

    if (scope.level === 'clients') {
      if (!scope.clientIds?.length) {
        qb.andWhere('1 = 0'); // no assignments → empty result
      } else {
        qb.andWhere(`${cp} IN (:...scopeIds)`, { scopeIds: scope.clientIds });
      }
    } else if (scope.level === 'client') {
      qb.andWhere(`${cp} = :scopeCid`, { scopeCid: scope.clientId });
    } else if (scope.level === 'branches') {
      if (scope.clientId) {
        qb.andWhere(`${cp} = :scopeCid`, { scopeCid: scope.clientId });
      }
      if (scope.branchIds?.length) {
        qb.andWhere(`${bp} IN (:...scopeBids)`, { scopeBids: scope.branchIds });
      }
    }
  }
}
