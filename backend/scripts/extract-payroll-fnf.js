const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const body = lines
  .slice(3242, 3972)
  .join('\n')
  .replace(/this\.getAssignedClientIds/g, 'this.scope.getAssignedClientIds')
  .replace(
    /this\.assertPayrollAccessToClient/g,
    'this.scope.assertPayrollAccessToClient',
  );

const header = `import * as fs from 'fs';
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { CreateFnfDto, UpdateFnfStatusDto } from './dto/payroll-fnf.dto';
import { PayrollFnfDocumentEntity } from './entities/payroll-fnf-document.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { PayrollFnfEventEntity } from './entities/payroll-fnf-event.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { evaluateFormula } from './engine/expression';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollFnfService {
  constructor(
    @InjectRepository(PayrollFnfEntity)
    private readonly fnfRepo: Repository<PayrollFnfEntity>,
    @InjectRepository(PayrollFnfEventEntity)
    private readonly fnfEventRepo: Repository<PayrollFnfEventEntity>,
    @InjectRepository(PayrollFnfDocumentEntity)
    private readonly fnfDocRepo: Repository<PayrollFnfDocumentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    private readonly scope: PayrollClientScopeService,
  ) {}

`;

const out = path.join(__dirname, '../src/payroll/payroll-fnf.service.ts');
fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
