import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../../access/access-scope.service';
import { ServiceEntitlementsService } from '../../service-entitlements/service-entitlements.service';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../entities/payroll-run-employee.entity';
import { parseRegister, reconcileRegister } from './register-reconciliation';

@Injectable()
export class PayrollReconciliationService {
  constructor(
    private readonly db: DataSource,
    private readonly access: AccessScopeService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  async compare(user: ReqUser, runId: string, file?: Express.Multer.File) {
    if (!['PAYROLL', 'ADMIN'].includes(user.roleCode))
      throw new ForbiddenException('Payroll or admin access required.');
    if (!file || !/\.csv$/i.test(file.originalname) || !file.buffer)
      throw new BadRequestException('Upload a UTF-8 CSV wage register.');
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const run = await manager.findOne(PayrollRunEntity, {
        where: { id: runId },
      });
      if (!run) throw new NotFoundException('Payroll run not found.');
      await this.access.assertClientAllowed(user, run.clientId);
      if (!(await this.entitlements.hasModule(run.clientId, 'PAYROLL')))
        throw new ForbiddenException(
          'Payroll is not enabled for this company.',
        );
      if (!['PROCESSED', 'SUBMITTED', 'APPROVED'].includes(run.status))
        throw new BadRequestException(
          'Process this payroll run before comparing its amounts.',
        );
      const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
      const uploaded = parseRegister(file.buffer, period);
      const employees = await manager.find(PayrollRunEmployeeEntity, {
        where: { runId: run.id, clientId: run.clientId },
        order: { employeeCode: 'ASC' },
        take: 5001,
      });
      if (employees.length > 5000)
        throw new BadRequestException(
          'This comparison supports up to 5,000 payroll employees.',
        );
      const expected = employees.map((employee) => ({
        employeeCode: employee.employeeCode,
        values: {
          gross_earnings: employee.grossEarnings,
          net_pay: employee.netPay,
          pf_employee: employee.pfEmployee,
          esi_employee: employee.esiEmployee,
        },
      }));
      const hash = (value: string | Buffer) =>
        createHash('sha256').update(value).digest('hex');
      return {
        ...reconcileRegister(expected, uploaded),
        run: {
          id: run.id,
          clientId: run.clientId,
          branchId: run.branchId,
          period,
          status: run.status,
          updatedAt: run.updatedAt,
        },
        source: {
          fileName: file.originalname
            .replace(/[^a-zA-Z0-9._ -]/g, '_')
            .slice(0, 255),
          sha256: hash(file.buffer),
        },
        baselineSha256: hash(
          JSON.stringify({ runId: run.id, period, expected }),
        ),
        generatedAt: new Date().toISOString(),
        comparedBy: user.userId,
        note: 'Comparison of supplied CSV values with a payroll snapshot. Differences are uploaded minus payroll. Blank amounts are unknown, not zero. Matching amounts do not verify payment or statutory remittance. Review findings before acting; payroll is unchanged.',
      };
    });
  }
}
