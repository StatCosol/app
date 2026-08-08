const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
const out = path.join(__dirname, '../src/payroll/payroll-runs.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const chunks = [
  [findLine((l) => l.includes('async clientListPayrollRuns')), findLine((l) => l.includes('async clientUploadPayrollInputFile'))],
  [findLine((l) => l.includes('async createPayrollRun')), findLine((l) => l.includes('async uploadPayrollRunEmployees'))],
  [findLine((l) => l.includes('async listPayrollRuns')), findLine((l) => l.includes('async listPayrollRunEmployees'))],
  [findLine((l) => l.includes('async processPayrollRun')), findLine((l) => l.includes('async approvePayrollRun'))],
  [findLine((l) => l.includes('async seedMarchEl')), findLine((l) => l.includes('async removeNotInSheet')) + 30],
];

const body = chunks
  .filter(([a, b]) => a >= 0 && b > a)
  .map(([a, b]) => lines.slice(a, b).join('\n'))
  .join('\n\n')
  .replace(/this\.assertPayrollAccessToClient/g, 'this.scope.assertPayrollAccessToClient')
  .replace(/await this\.ensureClientPayrollAccess/g, 'await this.ensureClientPayrollAccess');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollInputEntity } from './entities/payroll-input.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunItemEntity } from './entities/payroll-run-item.entity';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollRunsService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(PayrollInputEntity)
    private readonly inputRepo: Repository<PayrollInputEntity>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    private readonly scope: PayrollClientScopeService,
  ) {}

  private async getClientAccessToggles(clientId: string) {
    const row = await this.clientSettingsRepo.findOne({ where: { clientId } });
    const s = row?.settings || {};
    return {
      allowBranchPayrollAccess: s.allowBranchPayrollAccess === true,
    };
  }

  private async ensureClientPayrollAccess(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    if (!isClient) {
      throw new BadRequestException(
        'Only client users can access this resource',
      );
    }
    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }
  }

`;

// Trim trailing class close from payroll.service if included
let trimmed = body.replace(/\n\}\s*$/, '');
fs.writeFileSync(out, header + trimmed + '\n}\n');
console.log('Wrote', out);
