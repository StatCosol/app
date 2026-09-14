import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';

@Injectable()
export class PayrollClientScopeService {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
  ) {}

  /**
   * Clients a CRM is assigned to, from client_assignments_current — the same
   * source AccessScopeService and ScopeGuard use for CRM.
   */
  private async getCrmClientIds(user: ReqUser): Promise<string[]> {
    const rows: Array<{ client_id: string }> =
      await this.clientRepo.manager.query(
        `SELECT DISTINCT a.client_id
           FROM client_assignments_current a
           JOIN clients c ON c.id = a.client_id
          WHERE a.assigned_to_user_id = $1
            AND (c.is_deleted = false OR c.is_deleted IS NULL)`,
        [user.id],
      );
    return rows.map((r) => r.client_id);
  }

  async getAssignedClientIds(user: ReqUser): Promise<string[]> {
    // CRM used to sit with ADMIN and CCO here and resolve to every client, so
    // every payroll screen a CRM can open (payslips, queries, F&F, dashboard)
    // showed all tenants — while ScopeGuard and AccessScopeService limit CRM
    // to its assigned clients. CRM is assignment-scoped like everywhere else.
    if (user.roleCode === 'CRM') {
      return this.getCrmClientIds(user);
    }
    if (user.roleCode === 'ADMIN' || user.roleCode === 'CCO') {
      const clients = await this.clientRepo
        .createQueryBuilder('c')
        .select('c.id')
        .where('c.is_deleted = false')
        .getMany();
      return clients.map((c) => c.id);
    }
    // Join clients and drop deleted ones, exactly as getAssignedClients does.
    //
    // Reading assignment rows alone counted clients that no longer exist: a
    // payroll user assigned to three clients, one since soft-deleted, saw
    // "Assigned Clients 3" against a list of two, because only the list joined
    // clients and filtered is_deleted.
    //
    // The visible mismatch was the smaller half of it. These ids also scope the
    // employee statistics on the same dashboard, so a deleted client's staff
    // were still counted in total/active employees and in the PF and ESI
    // pending figures — numbers people act on.
    //
    // DISTINCT because a client with more than one active assignment row would
    // otherwise be counted twice and widen the IN clause for no reason.
    const rows = await this.assignRepo
      .createQueryBuilder('a')
      .innerJoin(ClientEntity, 'c', 'c.id = a.client_id')
      .select('DISTINCT a.client_id', 'clientId')
      .where('a.payroll_user_id = :uid', { uid: user.id })
      .andWhere('a.status = :s', { s: 'ACTIVE' })
      .andWhere('a.end_date IS NULL')
      .andWhere('c.is_deleted = false')
      .getRawMany<{ clientId: string }>();
    return rows.map((r) => r.clientId);
  }

  async assertPayrollAccessToClient(
    payrollUser: ReqUser,
    clientId: string,
    opts?: { allowReadOnly?: boolean },
  ) {
    if (!payrollUser?.id) throw new BadRequestException('Invalid user');
    if (payrollUser?.roleCode === 'ADMIN') return;
    if (opts?.allowReadOnly && payrollUser?.roleCode === 'CRM') {
      // Read-only still means "one of my clients" for a CRM. This returned
      // early for any client, so CRM could open another tenant's F&F, inputs,
      // payslips and registers wherever a caller passed allowReadOnly.
      const crmClients = await this.getCrmClientIds(payrollUser);
      if (!crmClients.includes(clientId)) {
        throw new ForbiddenException('CRM not assigned to this client');
      }
      return;
    }
    if (opts?.allowReadOnly && ['CEO', 'CCO'].includes(payrollUser?.roleCode)) {
      return;
    }
    if (payrollUser?.roleCode === 'PAYROLL') {
      const ok = await this.assignRepo.exist({
        where: {
          clientId,
          payrollUserId: payrollUser.id,
          status: 'ACTIVE',
          endDate: IsNull(),
        },
      });
      if (!ok) {
        throw new ForbiddenException(
          'Payroll user not assigned to this client',
        );
      }
      return;
    }
    throw new ForbiddenException('Only payroll/admin allowed');
  }
}
