const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');

const chunks = [
  [452, 468],
  [680, 900],
  [1179, 1536],
  [1603, 1739],
];

const body = chunks.map(([a, b]) => lines.slice(a, b).join('\n')).join('\n\n');

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
import { generateAuditReportPdfBuffer } from './utils/report-pdf';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';

@Injectable()
export class AuditReportService {
  private auditReportColumnsCache: {
    scope: boolean;
    methodology: boolean;
    selectedObservationIds: boolean;
    finalizedAt: boolean;
  } | null = null;

  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    private readonly dataSource: DataSource,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  private assertCrm(user: ReqUser) {
    if (!user || user.roleCode !== 'CRM') {
      throw new ForbiddenException('CRM access only');
    }
  }

  async getReportStatusForAuditor(user: ReqUser, id: string) {
    const audit = await this.ensureAuditorAuditAccess(user, id);
    return this.buildReportStatus(audit);
  }

`;

fs.writeFileSync(
  path.join(__dirname, '../src/audits/audit-report.service.ts'),
  header + body + '\n}\n',
);
console.log('audit-report.service.ts');
