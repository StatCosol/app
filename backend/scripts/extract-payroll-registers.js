const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/payroll/payroll.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

const chunks = [
  [1446, 1792],
  [2458, 2532],
  [3005, 3156],
];

const body = chunks
  .map(([a, b]) => lines.slice(a, b).join('\n'))
  .join('\n\n')
  .replace(/this\.assertPayrollAccessToClient/g, 'this.scope.assertPayrollAccessToClient');

const helpers = `
  private ensureClientOrBranchUser(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    if (!isClient) {
      throw new BadRequestException(
        'Only client users can access this resource',
      );
    }
  }

  private async ensureClientPayrollAccess(user: ReqUser) {
    this.ensureClientOrBranchUser(user);
    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }
  }

  private async getClientAccessToggles(clientId: string): Promise<{
    allowBranchPayrollAccess: boolean;
    allowBranchWageRegisters: boolean;
    allowBranchSalaryRegisters: boolean;
    payrollBranchScope: 'ALL' | 'SELECTED';
    payrollAllowedBranchIds: string[];
  }> {
    const row = await this.clientSettingsRepo.findOne({ where: { clientId } });
    const s = row?.settings || {};
    return {
      allowBranchPayrollAccess: s.allowBranchPayrollAccess === true,
      allowBranchWageRegisters: s.allowBranchWageRegisters === true,
      allowBranchSalaryRegisters: s.allowBranchSalaryRegisters === true,
      payrollBranchScope:
        s.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds: Array.isArray(s.payrollAllowedBranchIds)
        ? s.payrollAllowedBranchIds
        : [],
    };
  }
`;

const header = `import * as fs from 'fs';
import archiver from 'archiver';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AuditEntity } from '../audits/entities/audit.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { AuditType } from '../common/enums';
import { ClientUploadRegisterRecordDto } from './dto/client-payroll-input.dto';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { RegistersRecordEntity } from './entities/registers-record.entity';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollRegistersService {
  constructor(
    @InjectRepository(RegistersRecordEntity)
    private readonly rrRepo: Repository<RegistersRecordEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    private readonly scope: PayrollClientScopeService,
  ) {}
${helpers}
`;

const out = path.join(__dirname, '../src/payroll/payroll-registers.service.ts');
fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
