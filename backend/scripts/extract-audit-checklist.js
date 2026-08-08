const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/audits/audits.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const body = lines.slice(2944, 3151).join('\n');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';

@Injectable()
export class AuditChecklistService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditChecklistItemEntity)
    private readonly checklistRepo: Repository<AuditChecklistItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

`;

const out = path.join(__dirname, '../src/audits/audit-checklist.service.ts');
fs.writeFileSync(out, header + body + '\n}\n');
console.log('Wrote', out);
