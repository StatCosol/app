import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

/** Resolve ownership from stored resources, not from a caller's claimed client. */
@Injectable()
export class PayrollConfigurationScopeGuard implements CanActivate {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessScopeService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: ReqUser = request.user;
    if (!user) throw new ForbiddenException('Authentication required');
    const route =
      this.reflector.get<string>(PATH_METADATA, context.getHandler()) || '';
    const controller =
      this.reflector.get<string>(PATH_METADATA, context.getClass()) || '';
    const params = request.params || {},
      body = request.body || {},
      query = request.query || {};
    const clients = new Set<string>();
    const addClient = (id: unknown) => {
      if (id == null || id === '') return;
      if (typeof id !== 'string' || !isUUID(id))
        throw new BadRequestException('Invalid client ID');
      clients.add(id.toLowerCase());
    };
    for (const source of [params, body, query]) addClient(source.clientId);
    // Table names are exclusively constants in this guard; IDs remain bound parameters.
    const owner = async (
      table: string,
      id: unknown,
      column = 'client_id',
      allowGlobal = false,
    ) => {
      if (id == null || id === '') return;
      if (typeof id !== 'string' || !isUUID(id))
        throw new BadRequestException('Invalid payroll resource ID');
      const [row] = await this.ds.query(
        `SELECT ${column} AS client_id FROM ${table} WHERE id=$1`,
        [id],
      );
      if (!row) throw new NotFoundException('Payroll resource not found');
      if (!row.client_id && !allowGlobal)
        throw new ForbiddenException('Payroll resource has no client');
      if (
        !row.client_id &&
        allowGlobal &&
        request.method !== 'GET' &&
        user.roleCode !== 'ADMIN'
      )
        throw new ForbiddenException(
          'Only an administrator can change shared templates',
        );
      addClient(row.client_id);
    };
    if (controller.includes('client-structures')) {
      await owner('payroll_client_structures', params.id);
    } else {
      if (route.startsWith('structures/'))
        await owner('pay_salary_structures', params.id || params.structureId);
      if (route.startsWith('rule-sets/'))
        await owner('pay_rule_sets', params.id || params.ruleSetId);
      if (route.startsWith('formula-templates/'))
        await owner('pay_formula_templates', params.id, 'client_id', true);
      await owner('payroll_runs', params.runId);
      await owner('pay_rule_sets', body.ruleSetId);
      await owner('payroll_components', body.componentId || query.componentId);
      if (Array.isArray(body.items)) {
        const ids = [
          ...new Set(body.items.map((item: any) => item.componentId)),
        ];
        if (ids.some((id) => typeof id !== 'string' || !isUUID(id)))
          throw new BadRequestException('Invalid payroll component ID');
        if (ids.length) {
          const rows = await this.ds.query(
            'SELECT id, client_id FROM payroll_components WHERE id=ANY($1::uuid[])',
            [ids],
          );
          if (rows.length !== ids.length)
            throw new NotFoundException('Payroll component not found');
          for (const row of rows) addClient(row.client_id);
        }
      }
      await owner('employees', body.employeeId);
      await owner('departments', body.departmentId);
      await owner('grades', body.gradeId);
      await owner('client_branches', body.branchId, 'clientid');
      if (
        route === 'formula-templates' &&
        request.method === 'POST' &&
        !body.clientId &&
        user.roleCode !== 'ADMIN'
      )
        throw new ForbiddenException('Select a client for the template');
    }
    if (clients.size > 1)
      throw new ForbiddenException(
        'Payroll resources must belong to the same client',
      );
    for (const clientId of clients) {
      await this.access.assertClientAllowed(user, clientId);
      if (user.roleCode === 'CCO')
        await this.access.assertCcoClientAllowed(user, clientId);
    }
    return true;
  }
}
