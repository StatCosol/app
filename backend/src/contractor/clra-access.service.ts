import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

type Owner = { clientId: string | null; branchId: string | null };

/** Records of the CLRA chain, each resolved to the PE establishment that owns it. */
const OWNER_SQL = {
  pe: `SELECT pe.client_id, pe.branch_id
         FROM clra_pe_establishments pe WHERE pe.id = $1`,
  assignment: `SELECT pe.client_id, pe.branch_id
         FROM clra_contractor_assignments a
         JOIN clra_pe_establishments pe ON pe.id = a.pe_establishment_id
        WHERE a.id = $1`,
  deployment: `SELECT pe.client_id, pe.branch_id
         FROM clra_worker_deployments d
         JOIN clra_contractor_assignments a ON a.id = d.assignment_id
         JOIN clra_pe_establishments pe ON pe.id = a.pe_establishment_id
        WHERE d.id = $1`,
  wagePeriod: `SELECT pe.client_id, pe.branch_id
         FROM clra_wage_periods wp
         JOIN clra_contractor_assignments a ON a.id = wp.assignment_id
         JOIN clra_pe_establishments pe ON pe.id = a.pe_establishment_id
        WHERE wp.id = $1`,
  registerRun: `SELECT pe.client_id, pe.branch_id
         FROM clra_register_runs rr
         JOIN clra_contractor_assignments a ON a.id = rr.assignment_id
         JOIN clra_pe_establishments pe ON pe.id = a.pe_establishment_id
        WHERE rr.id = $1`,
} as const;

/** What a list may show: null = everything, otherwise these clients (and branches). */
export type ClraListScope = null | {
  clientIds: string[];
  branchIds?: string[];
};

/**
 * Tenancy for the CLRA module.
 *
 * Every CLRA record hangs off a PE establishment, and the PE carries the
 * client and branch. The controller used to act on ids alone and list without
 * a client filter, so a CLIENT user could read every company's contractors,
 * assignments, workers, wage periods, attendance, wages and registers, and a
 * CRM could edit any of them. This resolves a record to its PE and checks the
 * caller against it with the same rule the rest of the app uses
 * (AccessScopeService.assertDocumentInScope: client, then branch for branch
 * users).
 *
 * Contractors and their workers are not owned by one client — a contractor can
 * be assigned at several — so they are visible through an assignment in scope.
 */
@Injectable()
export class ClraAccessService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  private async owner(
    kind: keyof typeof OWNER_SQL,
    id: string,
  ): Promise<Owner> {
    const [row] = await this.ds.query(OWNER_SQL[kind], [id]);
    if (!row) throw new NotFoundException('CLRA record not found');
    return { clientId: row.client_id, branchId: row.branch_id ?? null };
  }

  private async check(user: ReqUser, kind: keyof typeof OWNER_SQL, id: string) {
    await this.access.assertDocumentInScope(user, await this.owner(kind, id));
  }

  assertPe = (user: ReqUser, id: string) => this.check(user, 'pe', id);
  assertAssignment = (user: ReqUser, id: string) =>
    this.check(user, 'assignment', id);
  assertDeployment = (user: ReqUser, id: string) =>
    this.check(user, 'deployment', id);
  assertWagePeriod = (user: ReqUser, id: string) =>
    this.check(user, 'wagePeriod', id);
  assertRegisterRun = (user: ReqUser, id: string) =>
    this.check(user, 'registerRun', id);

  /**
   * A contractor is visible when one of its assignments is. One with no
   * assignment yet belongs to no client: staff who set CLRA up (CRM) may work
   * on it — they create the contractor before its first assignment — but a
   * CLIENT user may not.
   */
  async assertContractor(user: ReqUser, contractorId: string): Promise<void> {
    const scope = await this.access.getScope(user);
    if (scope.level === 'all') return;
    const exists = await this.ds.query(
      `SELECT 1 FROM clra_contractors WHERE id = $1`,
      [contractorId],
    );
    if (!exists.length) throw new NotFoundException('Contractor not found');
    const owners: Array<{ client_id: string; branch_id: string | null }> =
      await this.ds.query(
        `SELECT DISTINCT pe.client_id, pe.branch_id
           FROM clra_contractor_assignments a
           JOIN clra_pe_establishments pe ON pe.id = a.pe_establishment_id
          WHERE a.contractor_id = $1`,
        [contractorId],
      );
    if (!owners.length) {
      if (user.roleCode === 'CRM') return;
      throw new ForbiddenException('Contractor not in scope');
    }
    for (const o of owners) {
      try {
        await this.access.assertDocumentInScope(user, {
          clientId: o.client_id,
          branchId: o.branch_id,
        });
        return;
      } catch {
        /* try the next assignment */
      }
    }
    throw new ForbiddenException('Contractor not in scope');
  }

  async assertWorker(user: ReqUser, workerId: string): Promise<void> {
    const [row] = await this.ds.query(
      `SELECT contractor_id FROM clra_contractor_workers WHERE id = $1`,
      [workerId],
    );
    if (!row) throw new NotFoundException('Worker not found');
    await this.assertContractor(user, row.contractor_id);
  }

  /**
   * Check every record a request body points at. Creates and updates name
   * their parents by id (an assignment names a PE, a wage row a wage period
   * and a deployment), which would otherwise attach a record to another
   * company's chain.
   */
  async assertBodyRefs(
    user: ReqUser,
    dto: Partial<
      Record<
        | 'clientId'
        | 'peEstablishmentId'
        | 'assignmentId'
        | 'contractorId'
        | 'workerId'
        | 'wagePeriodId'
        | 'workerDeploymentId',
        unknown
      >
    >,
  ): Promise<void> {
    const id = (v: unknown) => (typeof v === 'string' && v ? v : null);
    if (id(dto.clientId))
      await this.access.assertClientAllowed(user, id(dto.clientId)!);
    if (id(dto.peEstablishmentId))
      await this.assertPe(user, id(dto.peEstablishmentId)!);
    if (id(dto.assignmentId))
      await this.assertAssignment(user, id(dto.assignmentId)!);
    if (id(dto.contractorId))
      await this.assertContractor(user, id(dto.contractorId)!);
    if (id(dto.workerId)) await this.assertWorker(user, id(dto.workerId)!);
    if (id(dto.wagePeriodId))
      await this.assertWagePeriod(user, id(dto.wagePeriodId)!);
    if (id(dto.workerDeploymentId))
      await this.assertDeployment(user, id(dto.workerDeploymentId)!);
  }

  /** The clients (and branches) a list may show for this caller. */
  async listScope(user: ReqUser): Promise<ClraListScope> {
    const scope = await this.access.getScope(user);
    if (scope.level === 'all') return null;
    if (scope.level === 'clients') return { clientIds: scope.clientIds ?? [] };
    return {
      clientIds: scope.clientId ? [scope.clientId] : [],
      branchIds:
        scope.level === 'branches' ? (scope.branchIds ?? []) : undefined,
    };
  }
}
