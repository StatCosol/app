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
    const assignments = await this.assignRepo.find({
      where: { payrollUserId: user.id, status: 'ACTIVE', endDate: IsNull() },
      select: ['clientId'],
    });
    return assignments.map((a) => a.clientId);
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
