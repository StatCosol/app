const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

const chunks = [
  [2619, 2673],
  [2720, 2784],
  [3265, 3574],
  [3790, 3863],
];

const body = chunks
  .map(([a, b]) => lines.slice(a, b).join('\n'))
  .join('\n\n');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditOutputEngineService } from '../automation/services/audit-output-engine.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditResubmissionEntity } from './entities/audit-resubmission.entity';

@Injectable()
export class AuditNcService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly docReviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    @InjectRepository(AuditResubmissionEntity)
    private readonly resubRepo: Repository<AuditResubmissionEntity>,
    private readonly dataSource: DataSource,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly auditOutputEngine: AuditOutputEngineService,
    @Optional() private readonly auditLogs?: AuditLogsService,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

`;

const out = path.join(__dirname, '../src/audits/audit-nc.service.ts');
fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
