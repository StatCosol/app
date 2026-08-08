const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const out = path.join(__dirname, '../src/audits/audit-listing.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const chunks = [
  [findLine((l) => l.includes('// ─── CRM: list audits')), findLine((l) => l.includes('async getReadinessForAuditor'))],
  [findLine((l) => l.includes('async listForAuditor(')), findLine((l) => l.includes('async getReportForAuditor'))],
  [findLine((l) => l.includes('async listForClient(')), findLine((l) => l.includes('// ─── Branch Audit KPI'))],
  [findLine((l) => l.includes('private ensurePeriod')), findLine((l) => l.includes('// ─── Audit Scoring'))],
  [findLine((l) => l.includes('async listContractorsForAuditor')), findLine((l) => l.includes('// ─── Auditor: List Documents'))],
  [findLine((l) => l.includes('async getUploadLockForContractor')), findLine((l) => l.includes('// ─── Auditor: Force-Complete'))],
  [findLine((l) => l.includes('async getDashboardAudits(')), findLine((l) => l.includes('//  CONTRACTOR / BRANCH NC VISIBILITY'))],
];

const body = chunks
  .filter(([a, b]) => a >= 0 && b > a)
  .map(([a, b]) => lines.slice(a, b).join('\n'))
  .join('\n\n');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { UsersService } from '../users/users.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';

export interface BranchAuditKpiItem {
  periodCode: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  open: number;
  closed: number;
}

@Injectable()
export class AuditListingService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  private assertCrm(user: ReqUser) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  private assertContractor(user: ReqUser) {
    if (!user || user.roleCode !== 'CONTRACTOR') {
      throw new ForbiddenException('Contractor access only');
    }
  }

`;

fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out, 'lines:', (header + body).split('\n').length);
