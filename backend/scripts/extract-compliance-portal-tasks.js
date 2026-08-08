const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/compliance/compliance.service.ts');
const out = path.join(__dirname, '../src/compliance/compliance-portal-tasks.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const helperStart = findLine((l) => l.includes('private async getContractorScope'));
const evidenceStart = findLine((l) => l.includes('private async getEvidenceWithTaskOrThrow'));
const loadTaskStart = findLine((l) => l.includes('private async loadTaskOrThrow'));
const dashboardMarker = findLine((l) => l.includes('// ---------- Dashboards'));
const contractorStart = findLine((l) => l.includes('// ---------- Contractor APIs'));
const portalEnd = findLine((l) => l.includes('async auditorAddRemark'), contractorStart);
// Find closing brace of auditorAddRemark (next line after throw)
let portalEndLine = portalEnd;
for (let i = portalEnd; i < lines.length; i++) {
  if (lines[i].trim() === '}' && i > portalEnd + 3) {
    portalEndLine = i + 1;
    break;
  }
}

const methodBlock = lines.slice(contractorStart, portalEndLine).join('\n');

const helperBlocks = [
  lines.slice(helperStart, evidenceStart).join('\n'),
  lines.slice(loadTaskStart, dashboardMarker).join('\n'),
].join('\n\n');

const header = `import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { UsersService } from '../users/users.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import {
  ComplianceMcdItem,
  McdItemStatus,
} from './entities/compliance-mcd-item.entity';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class CompliancePortalTasksService {
  private readonly logger = new Logger(CompliancePortalTasksService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly masters: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceComment)
    private readonly comments: Repository<ComplianceComment>,
    @InjectRepository(ComplianceEvidence)
    private readonly evidence: Repository<ComplianceEvidence>,
    @InjectRepository(ComplianceMcdItem)
    private readonly mcdItems: Repository<ComplianceMcdItem>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
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

`;

const footer = '\n}\n';
const content = header + helperBlocks + '\n\n' + methodBlock + footer;
fs.writeFileSync(out, content);
console.log('Wrote', out, 'lines:', content.split('\n').length);
