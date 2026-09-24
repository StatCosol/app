import {
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
import { ensureAuditChecklist } from './audit-checklist-template.helpers';

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

  async generateChecklistFromCompliance(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    // Auto-generate checklist items based on audit type
    // Each entry: [label, docType?] — docType enables exact matching in autoLinkChecklistItem
    if (
      ![
        'PLANNED',
        'IN_PROGRESS',
        'CORRECTION_PENDING',
        'REVERIFICATION_PENDING',
      ].includes(audit.status)
    ) {
      throw new BadRequestException(
        'This audit is read-only at its current stage',
      );
    }
    return this.dataSource.transaction((manager) =>
      ensureAuditChecklist(manager, audit),
    );
  }
}
