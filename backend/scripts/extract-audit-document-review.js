const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const out = path.join(__dirname, '../src/audits/audit-document-review.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const start = findLine((l) => l.includes('// ─── Auditor: List Documents for Audit'));
const end = findLine((l) => l.includes('// ─── Auditor: Submit Audit'));

const body = lines
  .slice(start, end)
  .join('\n')
  .replace(/this\.getForAuditor\(/g, 'this.listingService.getForAuditor(');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { NonComplianceEngineService } from '../automation/services/non-compliance-engine.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditObservationEntity } from './entities/audit-observation.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';
import { AuditDocumentReviewEntity } from './entities/audit-document-review.entity';
import { AuditNonComplianceEntity } from './entities/audit-non-compliance.entity';
import { AuditListingService } from './audit-listing.service';

@Injectable()
export class AuditDocumentReviewService {
  private readonly logger = new Logger(AuditDocumentReviewService.name);

  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditObservationEntity)
    private readonly observationRepo: Repository<AuditObservationEntity>,
    @InjectRepository(AuditChecklistItemEntity)
    private readonly checklistRepo: Repository<AuditChecklistItemEntity>,
    @InjectRepository(AuditDocumentReviewEntity)
    private readonly docReviewRepo: Repository<AuditDocumentReviewEntity>,
    @InjectRepository(AuditNonComplianceEntity)
    private readonly ncRepo: Repository<AuditNonComplianceEntity>,
    private readonly dataSource: DataSource,
    private readonly ncEngine: NonComplianceEngineService,
    private readonly listingService: AuditListingService,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

`;

fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
