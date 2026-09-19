import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

/**
 * Tenancy for /ae/units.
 *
 * Every route took a unit or task id and acted on it with no check of the
 * caller, so any CRM could read or change any company's applicability facts,
 * overrides, act profiles and tasks. This resolves the id to its unit and
 * checks the caller against it: the unit's branch when it has one (a real FK
 * to client_branches), otherwise its tenant_id, which is the client id. On
 * create, the tenant and branch named in the body are checked the same way.
 */
@Injectable()
export class ApplicabilityScopeGuard implements CanActivate {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user: ReqUser | undefined = req.user;
    if (!user) throw new ForbiddenException('Authentication required');
    const params = req.params ?? {};
    const body = req.body ?? {};

    let unitId: string | undefined = params.unitId;
    if (params.taskId) {
      const [task] = await this.ds.query(
        `SELECT unit_id FROM ae_unit_task WHERE id = $1`,
        [this.uuid(params.taskId)],
      );
      if (!task) throw new NotFoundException('Task not found');
      unitId = task.unit_id;
    }

    if (unitId) {
      const [unit] = await this.ds.query(
        `SELECT tenant_id, branch_id FROM ae_unit WHERE id = $1`,
        [this.uuid(unitId)],
      );
      if (!unit) throw new NotFoundException('Unit not found');
      if (unit.branch_id)
        await this.access.assertBranchAllowed(user, unit.branch_id);
      else await this.access.assertClientAllowed(user, unit.tenant_id);
    }

    // Create: a unit may only be made for a client and branch in scope.
    if (!unitId && req.method === 'POST') {
      if (body.tenantId)
        await this.access.assertClientAllowed(user, this.uuid(body.tenantId));
      if (body.branchId)
        await this.access.assertBranchAllowed(user, this.uuid(body.branchId));
    }
    return true;
  }

  private uuid(v: unknown): string {
    if (typeof v !== 'string' || !isUUID(v))
      throw new BadRequestException('Invalid id');
    return v;
  }
}
