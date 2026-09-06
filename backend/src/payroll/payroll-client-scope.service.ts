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

  async getAssignedClientIds(user: ReqUser): Promise<string[]> {
    if (
      user.roleCode === 'ADMIN' ||
      user.roleCode === 'CRM' ||
      user.roleCode === 'CCO'
    ) {
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
    if (
      opts?.allowReadOnly &&
      ['CRM', 'CEO', 'CCO'].includes(payrollUser?.roleCode)
    ) {
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
