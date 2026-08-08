const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
const out = path.join(__dirname, '../src/payroll/payroll-payslips.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const enrichStart = findLine((l) => l.includes('private async enrichLeaveAttendanceValues'));
const enrichEnd = findLine((l) => l.includes('private normalizeHeader'));
const empStart = findLine((l) => l.includes('async listPayrollRunEmployees'));
const payslipEnd = findLine((l) => l.includes('async approveRegister'));

const body = [
  lines.slice(enrichStart, enrichEnd).join('\n'),
  lines.slice(empStart, payslipEnd).join('\n'),
]
  .join('\n\n')
  .replace(/this\.assertPayrollAccessToClient/g, 'this.scope.assertPayrollAccessToClient');

const header = `import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { LeaveLedgerEntity } from '../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { LeavePolicyEntity } from '../ess/entities/leave-policy.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { HolidayCalendarService } from '../attendance/holiday-calendar.service';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { generatePayslipPdfBuffer, loadLogoBuffer } from './utils/payslip-pdf';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollPayslipsService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly payslipArchiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(LeavePolicyEntity)
    private readonly leavePolicyRepo: Repository<LeavePolicyEntity>,
    private readonly attendanceService: AttendanceService,
    private readonly holidayService: HolidayCalendarService,
    private readonly scope: PayrollClientScopeService,
  ) {}

`;

fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
