const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/compliance/compliance.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');
const body = lines.slice(978, 1478).join('\n');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { UsersService } from '../users/users.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ComplianceReuploadService } from './compliance-reupload.service';

@Injectable()
export class ComplianceCrmTasksService {
  private readonly logger = new Logger(ComplianceCrmTasksService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly masters: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceComment)
    private readonly comments: Repository<ComplianceComment>,
    @InjectRepository(ComplianceEvidence)
    private readonly evidence: Repository<ComplianceEvidence>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
    private readonly reuploadService: ComplianceReuploadService,
  ) {}

  private assertRole(user: ReqUser, allowed: string[]) {
    if (!allowed.includes(user?.roleCode)) {
      throw new ForbiddenException('Access denied');
    }
  }

  private toDateOnly(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return \`\${yyyy}-\${mm}-\${dd}\`;
  }

  private computePeriodCode(year: number, month?: number | null): string {
    if (month && month >= 1 && month <= 12) {
      return \`\${year}-\${String(month).padStart(2, '0')}\`;
    }
    return \`\${year}\`;
  }

  private computeUploadWindow(
    periodYear: number,
    periodMonth?: number | null,
  ): { startDate: string; endDate: string } | null {
    if (!periodMonth || periodMonth < 1 || periodMonth > 12) return null;
    const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
    const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
    const start = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    const end = new Date(Date.UTC(nextYear, nextMonth - 1, 27));
    return {
      startDate: this.toDateOnly(start),
      endDate: this.toDateOnly(end),
    };
  }

  private async assertCrmAssignedToClient(
    crmUserId: string,
    clientId: string,
  ) {
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      clientId,
      crmUserId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
  }

  private async getCrmAssignedClientIds(userId: string): Promise<string[]> {
    return this.reuploadService.getCrmAssignedClientIds(userId);
  }

  private async loadTaskOrThrow(taskId: string | number) {
    const idNum = Number(taskId);
    const t = await this.tasks.findOne({
      where: { id: idNum },
      relations: {
        compliance: true,
        branch: true,
        assignedTo: true,
        assignedBy: true,
      },
    });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  private computeOverdueStatus(task: ComplianceTask): TaskStatus {
    if (task.status === 'APPROVED') return task.status;
    const today = this.toDateOnly(new Date());
    if (
      task.dueDate < today &&
      (task.status === 'PENDING' ||
        task.status === 'IN_PROGRESS' ||
        task.status === 'REJECTED')
    ) {
      return 'OVERDUE';
    }
    return task.status;
  }

`;

fs.writeFileSync(
  path.join(__dirname, '../src/compliance/compliance-crm-tasks.service.ts'),
  header + body + '\n}\n',
);
console.log('compliance-crm-tasks.service.ts');
