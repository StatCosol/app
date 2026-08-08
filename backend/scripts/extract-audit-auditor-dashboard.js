const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');

const chunks = [
  [2625, 2670],
  [3182, 3301],
  [3414, 3440],
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
import { generatePreliminaryReportPdfBuffer } from './utils/report-pdf';
import { AuditEntity } from './entities/audit.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';

@Injectable()
export class AuditAuditorDashboardService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly docReviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

`;

const out = path.join(__dirname, '../src/audits/audit-auditor-dashboard.service.ts');
fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
