import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { ClientAssignment } from '../assignments/entities/client-assignment.entity';
import { BranchAuditorAssignmentEntity } from '../assignments/entities/branch-auditor-assignment.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';

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

/**
 * Roles that see the whole dataset.
 *
 * PAYROLL is deliberately NOT here. It used to be, which meant a payroll user
 * resolved to level 'all' and could reach every client — while JwtStrategy was
 * loading getPayrollAssignedClientIds() for that same role and FilesService was
 * checking payroll_client_assignments before serving a payroll file. The rest
 * of the system already treated payroll as assignment-scoped; only this list
 * disagreed, and it was the one that decided.
 */
const GLOBAL_ROLES = ['ADMIN', 'CEO', 'CCO'];

@Injectable()
export class AccessScopeService {
  private readonly logger = new Logger(AccessScopeService.name);

  constructor(
    @InjectRepository(ClientAssignment)
    private readonly caRepo: Repository<ClientAssignment>,
    @InjectRepository(BranchAuditorAssignmentEntity)
    private readonly _baaRepo: Repository<BranchAuditorAssignmentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly payrollAssignRepo: Repository<PayrollClientAssignmentEntity>,
  ) {}

  /* ── Scope resolution ────────────────────────────────────────── */

  async getScope(user: ReqUser): Promise<ScopeResult> {
    const { roleCode, clientId, branchIds } = user;

    if (GLOBAL_ROLES.includes(roleCode)) {
      return { level: 'all' };
    }

    if (roleCode === 'PAYROLL') {
      /*
       * Read the assignments rather than trusting user.assignedClientIds.
       *
       * That field is only populated by JwtStrategy; FilesController and the
       * /uploads middleware in main.ts each build their own ReqUser with an
       * empty list, so a payroll user would silently lose access on exactly
       * the paths this scoping is meant to guard.
       */
      const assignments = await this.payrollAssignRepo.find({
        where: {
          payrollUserId: user.id,
          status: 'ACTIVE',
          endDate: IsNull(),
        },
        select: ['clientId'],
      });
      const clientIds = assignments.map((a) => a.clientId);
      if (!clientIds.length) {
        // Fails closed from here on, so say why — an unassigned payroll user
        // now sees nothing where they previously saw everything, and that
        // needs to be diagnosable from the logs rather than guessed at.
        this.logger.warn(
          `PAYROLL user ${user.id} has no active client assignments — scope is empty`,
        );
      }
      return { level: 'clients', clientIds };
    }

    if (roleCode === 'CRM' || roleCode === 'PAYDEK' || roleCode === 'AUDITOR') {
      /*
       * client_assignments_current, not the legacy client_assignments table.
       *
       * AssignmentsService.changeAssignment() and the automatic rotation write
       * client_assignments_current and the history table; nothing in the
       * application writes the legacy one, and no trigger syncs them. Resolving
       * scope from it therefore answered with whoever was assigned whenever
       * that table was last populated — a newly assigned CRM denied, a former
       * assignee still admitted.
       *
       * This is the same query UsersService.getAssignedClientIds() runs, which
       * is what JwtStrategy already puts on the token, so scope and token now
       * agree. Keyed on assigned_to_user_id alone for the same reason: a user
       * holds one role, and the row's type follows from it.
       */
      const rows: Array<{ client_id: string }> =
        await this.caRepo.manager.query(
          `SELECT client_id FROM client_assignments_current
            WHERE assigned_to_user_id = $1`,
          [user.id],
        );
      return {
        level: 'clients',
        clientIds: rows.map((r) => r.client_id),
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
      // A supplied clientId was trusted as given, so a CRM assigned to one
      // client could ask for another client's id and get its branches — the
      // dropdown was the whole authorization. Intersect it with the caller's
      // scope; picking a client they cannot see is a refusal, not an empty
      // list, because the UI should never have offered it.
      await this.assertClientAllowed(user, cid);
      qb.andWhere('b.clientId = :cid', { cid });
    } else if (scope.level === 'clients') {
      // Fail closed on an empty assignment set. Guarding this branch on
      // `clientIds?.length` meant a CRM or auditor with no assignments got no
      // filter at all and saw branches for every client — the opposite of the
      // intent. applyToQb() already does this correctly; this did not.
      if (!scope.clientIds?.length) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('b.clientId IN (:...ids)', { ids: scope.clientIds });
      }
    }

    // BRANCH / BRANCH_DESK — restrict to assigned branches.
    //
    // Guarding on `branchIds?.length` meant a branch user whose assignment list
    // was empty got no branch filter at all and saw every branch of the client
    // — the same fail-open that the `clients` case above was already fixed for.
    if (scope.level === 'branches') {
      const bids = scope.branchIds ?? [];
      if (!bids.length) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('b.id IN (:...bids)', { bids });
      }
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

  async getCcoClientIds(ccoUserId: string): Promise<string[]> {
    const rows = await this.clientRepo.manager.query(
      `SELECT c.id
         FROM clients c
         INNER JOIN users crm ON crm.id = c.assigned_crm_id
        WHERE crm.owner_cco_id = $1
          AND crm.deleted_at IS NULL
          AND (c.is_deleted = false OR c.is_deleted IS NULL)`,
      [ccoUserId],
    );
    return rows.map((r: { id: string }) => r.id);
  }

  async assertCcoClientAllowed(user: ReqUser, clientId: string): Promise<void> {
    if (user.roleCode !== 'CCO') return;
    const ccoId = user.userId ?? user.id;
    const rows = await this.clientRepo.manager.query(
      `SELECT 1
         FROM clients c
         INNER JOIN users crm ON crm.id = c.assigned_crm_id
        WHERE c.id = $1
          AND crm.owner_cco_id = $2
          AND crm.deleted_at IS NULL
          AND (c.is_deleted = false OR c.is_deleted IS NULL)
        LIMIT 1`,
      [clientId, ccoId],
    );
    if (!rows.length) throw new ForbiddenException('Client not in CCO scope');
  }

  async assertCcoBranchAllowed(user: ReqUser, branchId: string): Promise<void> {
    if (user.roleCode !== 'CCO') return;
    const ccoId = user.userId ?? user.id;
    const rows = await this.branchRepo.manager.query(
      `SELECT 1
         FROM client_branches b
         INNER JOIN clients c ON c.id = b.clientid
         INNER JOIN users crm ON crm.id = c.assigned_crm_id
        WHERE b.id = $1
          AND crm.owner_cco_id = $2
          AND crm.deleted_at IS NULL
          AND (b.isdeleted = false OR b.isdeleted IS NULL)
          AND (c.is_deleted = false OR c.is_deleted IS NULL)
        LIMIT 1`,
      [branchId, ccoId],
    );
    if (!rows.length) throw new ForbiddenException('Branch not in CCO scope');
  }

  /**
   * May this user have a document owned by (clientId, branchId)?
   *
   * One rule, because this question kept being answered separately and the
   * copies disagreed. A branch user's roleCode is CLIENT — only userType tells
   * them apart — so any check written as "does the document's client match
   * mine?" admits them to every branch in the company. That shipped twice: CRM
   * unit documents and safety documents, each with a correctly scoped branch
   * endpoint sitting beside a client endpoint that was not.
   *
   * A null branchId means company-scoped: visible to anyone the client check
   * admits, which is what the branch-scoped listings already do.
   */
  async assertDocumentInScope(
    user: ReqUser,
    doc: { clientId: string | null; branchId?: string | null },
  ): Promise<void> {
    if (!doc.clientId) throw new ForbiddenException('Document has no owner');

    await this.assertClientAllowed(user, doc.clientId);

    if (!doc.branchId) return;

    const scope = await this.getScope(user);
    if (scope.level === 'branches') {
      if (!(scope.branchIds ?? []).includes(doc.branchId)) {
        throw new ForbiddenException('Branch not in scope');
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
