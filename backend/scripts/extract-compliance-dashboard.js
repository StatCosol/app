const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/compliance/compliance.service.ts');
const lines = fs.readFileSync(src, 'utf8').split('\n');
const body = lines.slice(364, 978).join('\n');

const header = `import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { BranchEntity } from '../branches/entities/branch.entity';
import { ComplianceTask } from './entities/compliance-task.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ComplianceReuploadService } from './compliance-reupload.service';

@Injectable()
export class ComplianceDashboardService {
  constructor(
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(DocumentReuploadRequest)
    private readonly reuploadReqRepo: Repository<DocumentReuploadRequest>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
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

  private async getCrmAssignedClientIds(userId: string): Promise<string[]> {
    return this.reuploadService.getCrmAssignedClientIds(userId);
  }

`;

fs.writeFileSync(
  path.join(__dirname, '../src/compliance/compliance-dashboard.service.ts'),
  header + body + '\n}\n',
);
console.log('compliance-dashboard.service.ts');
