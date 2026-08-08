const fs = require('fs');
const path = require('path');

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n');
}

function sliceChunks(lines, chunks) {
  return chunks
    .map(([a, b]) => lines.slice(a, b).join('\n'))
    .join('\n\n')
    .replace(/this\.assertPayrollAccessToClient/g, 'this.scope.assertPayrollAccessToClient');
}

const payrollSrc = path.join(__dirname, '../src/payroll/payroll.service.ts');
const lines = readLines(payrollSrc);

const body = sliceChunks(lines, [
  [335, 439],
  [440, 496],
  [588, 661],
  [710, 833],
  [835, 921],
  [922, 1089],
  [2635, 2642],
]);

const header = `import * as fs from 'fs';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PayrollInputStatus,
  PAYROLL_INPUT_STATUS_TRANSITIONS,
} from './constants/payroll-input-status';
import {
  ClientCreatePayrollInputDto,
  ClientUploadPayrollInputFileDto,
} from './dto/client-payroll-input.dto';
import { ClientUpdatePayrollInputStatusDto } from './dto/client-update-payroll-input-status.dto';
import { UpdatePayrollInputStatusDto } from './dto/update-payroll-input-status.dto';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { PayrollClientTemplate } from './entities/payroll-client-template.entity';
import { PayrollInputEntity } from './entities/payroll-input.entity';
import { PayrollInputFileEntity } from './entities/payroll-input-file.entity';
import { PayrollInputStatusHistoryEntity } from './entities/payroll-input-status-history.entity';
import { PayrollTemplate } from './entities/payroll-template.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollInputService {
  constructor(
    @InjectRepository(PayrollInputEntity)
    private readonly inputRepo: Repository<PayrollInputEntity>,
    @InjectRepository(PayrollInputFileEntity)
    private readonly fileRepo: Repository<PayrollInputFileEntity>,
    @InjectRepository(PayrollInputStatusHistoryEntity)
    private readonly statusHistoryRepo: Repository<PayrollInputStatusHistoryEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    @InjectRepository(PayrollTemplate)
    private readonly templateRepo: Repository<PayrollTemplate>,
    @InjectRepository(PayrollClientTemplate)
    private readonly clientTemplateRepo: Repository<PayrollClientTemplate>,
    private readonly notificationsSvc: NotificationsService,
    private readonly scope: PayrollClientScopeService,
  ) {}

  ymLabel(year: number, month: number) {
    if (!year || !month) return '';
    return \`\${year}-\${String(month).padStart(2, '0')}\`;
  }

`;

fs.writeFileSync(
  path.join(__dirname, '../src/payroll/payroll-input.service.ts'),
  header + body + '\n}\n',
);
console.log('payroll-input.service.ts');
