import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { BranchComplianceEntity } from '../checklists/entities/branch-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { AuditEntity } from '../audits/entities/audit.entity';
import { UsersService } from '../users/users.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { UserEntity } from '../users/entities/user.entity';
import { AssignmentsService } from '../assignments/assignments.service';

@Injectable()
export class ContractorService {
  constructor(
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(BranchComplianceEntity)
    private readonly branchComplianceRepo: Repository<BranchComplianceEntity>,
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceRepo: Repository<ComplianceMasterEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ContractorDocumentEntity)
    private readonly contractorDocsRepo: Repository<ContractorDocumentEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    private readonly usersService: UsersService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  private async assertContractorForClient(
    crmUserId: string,
    contractorId: string,
  ) {
    const contractor = await this.userRepo.findOne({
      where: { id: contractorId },
      relations: ['branches'],
    });

    if (!contractor) {
      throw new BadRequestException('Contractor not found');
    }

    if (!contractor.clientId) {
      throw new BadRequestException('Contractor is not client-scoped');
    }

    const roleCode = await this.usersService.getUserRoleCode(contractorId);
    if (roleCode !== 'CONTRACTOR') {
      throw new BadRequestException('User is not a Contractor');
    }

    const isAssigned = await this.assignmentsService.isClientAssignedToCrm(
      contractor.clientId,
      crmUserId,
    );
    if (!isAssigned) {
      throw new BadRequestException(
        "CRM is not assigned to this contractor's client",
      );
    }

    return contractor;
  }

  async getDashboard(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }

    const clientId = user.clientId;

    // All branches for this contractor within this client
    const links = await this.branchContractorRepo.find({
      where: { contractorUserId: userId, clientId },
    });

    if (links.length === 0) {
      return {
        clientId,
        branches: [],
      };
    }

    const branchIds = links.map((l) => l.branchId);

    const branches = await this.branchRepo.find({
      where: { id: In(branchIds) },
      order: { id: 'ASC' },
    });

    const compliances = await this.branchComplianceRepo.find({
      where: { clientId, branchId: In(branchIds) },
      order: { branchId: 'ASC' },
    });

    const complianceIds = [
      ...new Set(compliances.map((c) => c.complianceId)),
    ].filter((id): id is string => !!id);
    const masters = complianceIds.length
      ? await this.complianceRepo.find({ where: { id: In(complianceIds) } })
      : [];
    const masterMap = new Map<string, ComplianceMasterEntity>();
    masters.forEach((m) => masterMap.set(m.id, m));

    const branchMap = new Map<
      string,
      { id: string; name: string; compliances: any[] }
    >();
    for (const b of branches) {
      branchMap.set(b.id, {
        id: b.id,
        name: b.branchName ?? '',
        compliances: [],
      });
    }

    for (const bc of compliances) {
      const branchEntry = branchMap.get(bc.branchId);
      if (!branchEntry) continue;
      const master = bc.complianceId
        ? masterMap.get(bc.complianceId)
        : undefined;
      branchEntry.compliances.push({
        complianceId: bc.complianceId,
        complianceName:
          master?.complianceName ?? `Compliance #${bc.complianceId}`,
        lawName: master?.lawName ?? null,
        frequency: master?.frequency ?? null,
        status: bc.status,
      });
    }

    // ── Document score & audit risk for the contractor ──
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    // Required doc count
    const [reqRow] = await this.branchContractorRepo.manager.query(
      `SELECT COUNT(*) AS cnt FROM contractor_required_documents
       WHERE client_id = $1 AND contractor_user_id = $2 AND is_required = TRUE`,
      [clientId, userId],
    );
    const requiredCount = Number(reqRow?.cnt || 0);

    // Doc stats for this month
    const [docRow] = await this.contractorDocsRepo.manager.query(
      `SELECT COUNT(DISTINCT doc_type) AS "uploadedDistinct",
              SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS "rejectedCount",
              SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS "expiredCount"
       FROM contractor_documents
       WHERE client_id = $1 AND contractor_user_id = $2
         AND branch_id = ANY($3)
         AND created_at >= $4 AND created_at < $5`,
      [clientId, userId, branchIds, monthStart, monthEnd],
    );
    const uploadedDistinct = Number(docRow?.uploadedDistinct || 0);
    const rejectedCount = Number(docRow?.rejectedCount || 0);
    const expiredCount = Number(docRow?.expiredCount || 0);
    const missingCount = Math.max(requiredCount - uploadedDistinct, 0);
    const penalty = missingCount * 10 + rejectedCount * 15 + expiredCount * 8;
    const documentScore = Math.max(0, 100 - penalty);
    const uploadPercent =
      requiredCount > 0
        ? Math.round((uploadedDistinct / requiredCount) * 100)
        : 0;

    // Audit risk points
    const [riskRow] = await this.contractorDocsRepo.manager.query(
      `SELECT SUM(CASE WHEN ao.risk = 'CRITICAL' THEN 4
                       WHEN ao.risk = 'HIGH' THEN 3
                       WHEN ao.risk = 'MEDIUM' THEN 2
                       WHEN ao.risk = 'LOW' THEN 1
                       ELSE 0 END) AS "riskPoints"
       FROM audit_observations ao
       JOIN audits a ON a.id = ao.audit_id
       WHERE a.client_id = $1
         AND a.contractor_user_id = $2
         AND ao.created_at >= $3
         AND ao.created_at < $4`,
      [clientId, userId, monthStart, monthEnd],
    );
    const auditRiskPoints = Number(riskRow?.riskPoints || 0);

    return {
      clientId,
      branches: Array.from(branchMap.values()),
      monthSummary: {
        month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        documentScore,
        uploadPercent,
        requiredCount,
        uploadedDistinct,
        missingCount,
        rejectedCount,
        expiredCount,
        auditRiskPoints,
      },
    };
  }

  // ---------- ConTrack portal: profile, documents, audits (no payroll) ----------

  async getContractorProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    const roleCode = await this.usersService.getUserRoleCode(userId);
    if (roleCode !== 'CONTRACTOR') {
      throw new BadRequestException('User is not a Contractor');
    }
    if (!user.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }

    const links = await this.branchContractorRepo.find({
      where: { contractorUserId: userId, clientId: user.clientId },
    });
    const branchIds = links.map((l) => l.branchId);
    const branches = branchIds.length
      ? await this.branchRepo.find({ where: { id: In(branchIds) } })
      : [];

    return {
      contractorUserId: userId,
      clientId: user.clientId,
      contractorName: user.name ?? null,
      email: user.email ?? null,
      phone: (user as any).phone ?? null,
      branches: branches.map((b) => ({
        id: b.id,
        branchName: b.branchName ?? '',
        clientId: b.clientId,
      })),
    };
  }

  async listContractorDocuments(userId: string, q: any) {
    const user = await this.usersService.findById(userId);
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }
    const where: any = {
      clientId: user.clientId,
      contractorUserId: userId,
    };
    if (q?.docType) where.docType = q.docType;
    if (q?.branchId) where.branchId = q.branchId;
    if (q?.auditId) where.auditId = q.auditId;

    const docs = await this.contractorDocsRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      branchId: d.branchId,
      auditId: d.auditId,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      filePath: d.filePath,
      createdAt: d.createdAt,
    }));
  }

  async uploadContractorDocument(
    userId: string,
    dto: {
      docType?: string;
      branchId?: string;
      auditId?: string;
      remarks?: string;
    },
    file: any,
  ) {
    if (!file) throw new BadRequestException('file required');
    if (!dto?.docType) throw new BadRequestException('docType required');

    const user = await this.usersService.findById(userId);
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }

    // Optional: validate branch is one of contractor's linked branches
    if (dto.branchId) {
      const link = await this.branchContractorRepo.findOne({
        where: {
          clientId: user.clientId,
          contractorUserId: userId,
          branchId: dto.branchId,
        },
      });
      if (!link) {
        throw new BadRequestException(
          'Branch is not linked to this contractor',
        );
      }
    }

    // Optional: validate audit belongs to this contractor
    if (dto.auditId) {
      const audit = await this.auditRepo.findOne({
        where: {
          id: dto.auditId,
          contractorUserId: userId,
          clientId: user.clientId,
        },
      });
      if (!audit) {
        throw new BadRequestException('Audit not found for this contractor');
      }
    }

    const doc = this.contractorDocsRepo.create({
      clientId: user.clientId,
      contractorUserId: userId,
      branchId: dto.branchId ?? undefined,
      auditId: dto.auditId ?? undefined,
      docType: dto.docType,
      title: file.originalname,
      fileName: file.originalname,
      filePath: file.path,
      fileType: file.mimetype,
      fileSize: String(file.size ?? 0),
      uploadedByUserId: userId,
    });
    const saved = await this.contractorDocsRepo.save(doc);

    return {
      message: 'Document uploaded',
      id: saved.id,
      docType: saved.docType,
      branchId: saved.branchId,
      auditId: saved.auditId,
    };
  }

  async listAuditsForContractor(userId: string, q: any) {
    const user = await this.usersService.findById(userId);
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }

    const where: any = { clientId: user.clientId, contractorUserId: userId };
    if (q?.status) where.status = q.status;

    const audits = await this.auditRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return audits.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      frequency: a.frequency,
      auditType: a.auditType,
      periodYear: a.periodYear,
      periodCode: a.periodCode,
      status: a.status,
      dueDate: a.dueDate,
      notes: a.notes,
      createdAt: a.createdAt,
    }));
  }

  async getAuditForContractor(userId: string, auditId: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }
    const audit = await this.auditRepo.findOne({
      where: { id: auditId, clientId: user.clientId, contractorUserId: userId },
    });
    if (!audit) throw new BadRequestException('Audit not found');
    return audit;
  }

  // ---- CRM: contractor ↔ branches via branch_contractor (single source of truth) ----

  async getContractorBranchesForCrm(crmUserId: string, contractorId: string) {
    const contractor = await this.assertContractorForClient(
      crmUserId,
      contractorId,
    );

    const links = await this.branchContractorRepo.find({
      where: { contractorUserId: contractorId, clientId: contractor.clientId! },
    });

    const branchIds = links.map((l) => l.branchId);

    const branches = branchIds.length
      ? await this.branchRepo.find({ where: { id: In(branchIds) } })
      : [];

    return {
      contractorId,
      clientId: contractor.clientId,
      branches: branches.map((b) => ({
        id: b.id,
        branchName: b.branchName ?? '',
        clientId: b.clientId,
      })),
    };
  }

  async setContractorBranchesForCrm(
    crmUserId: string,
    contractorId: string,
    branchIds: string[],
  ) {
    if (!Array.isArray(branchIds)) {
      throw new BadRequestException('branchIds must be an array');
    }

    const contractor = await this.assertContractorForClient(
      crmUserId,
      contractorId,
    );

    const branches = branchIds.length
      ? await this.branchRepo.find({
          where: {
            id: In(branchIds),
            clientId: contractor.clientId ?? undefined,
          },
        })
      : [];

    if (branches.length !== branchIds.length) {
      throw new BadRequestException(
        'Some branches are invalid or not part of this client',
      );
    }

    await this.branchContractorRepo.delete({
      contractorUserId: contractorId,
      clientId: contractor.clientId!,
    });

    if (branchIds.length) {
      await this.branchContractorRepo.save(
        branchIds.map((branchId) =>
          this.branchContractorRepo.create({
            clientId: contractor.clientId!,
            branchId,
            contractorUserId: contractorId,
          }),
        ),
      );
    }

    return { message: 'Branches updated', contractorId, branchIds };
  }

  async addContractorBranchesForCrm(
    crmUserId: string,
    contractorId: string,
    branchIds: string[],
  ) {
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      throw new BadRequestException('branchIds required');
    }

    const contractor = await this.assertContractorForClient(
      crmUserId,
      contractorId,
    );

    const branches = await this.branchRepo.find({
      where: { id: In(branchIds), clientId: contractor.clientId ?? undefined },
    });

    if (branches.length !== branchIds.length) {
      throw new BadRequestException(
        'Some branches are invalid or not part of this client',
      );
    }

    const existing = await this.branchContractorRepo.find({
      where: { contractorUserId: contractorId, clientId: contractor.clientId! },
    });

    const existingIds = new Set(existing.map((e) => e.branchId));

    const toInsert = branchIds
      .filter((id) => !existingIds.has(id))
      .map((branchId) =>
        this.branchContractorRepo.create({
          clientId: contractor.clientId!,
          branchId,
          contractorUserId: contractorId,
        }),
      );

    if (toInsert.length) {
      await this.branchContractorRepo.save(toInsert);
    }

    return { message: 'Branches added', contractorId };
  }

  async removeContractorBranchForCrm(
    crmUserId: string,
    contractorId: string,
    branchId: string,
  ) {
    const contractor = await this.assertContractorForClient(
      crmUserId,
      contractorId,
    );

    await this.branchContractorRepo.delete({
      contractorUserId: contractorId,
      clientId: contractor.clientId!,
      branchId,
    });

    return { message: 'Branch removed', contractorId, branchId };
  }

  // Admin view: list contractor users with their client and branches
  async listContractorLinks() {
    const links = await this.branchContractorRepo.find({
      relations: ['branch'],
      order: { contractorUserId: 'ASC', id: 'ASC' },
    });

    if (!links.length) {
      return [];
    }

    const clientIds = Array.from(new Set(links.map((l) => l.clientId)));
    const userIds = Array.from(new Set(links.map((l) => l.contractorUserId)));

    const [clients, users] = await Promise.all([
      this.clientRepo.find({ where: { id: In(clientIds) } }),
      this.userRepo.find({ where: { id: In(userIds) } }),
    ]);

    const clientMap = new Map<string, ClientEntity>();
    clients.forEach((c) => clientMap.set(c.id, c));

    const userMap = new Map<string, UserEntity>();
    users.forEach((u) => userMap.set(u.id, u));

    const resultMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        userEmail: string;
        clientId: string | null;
        clientName: string | null;
        branches: { id: string; name: string }[];
      }
    >();

    for (const link of links) {
      const existing = resultMap.get(link.contractorUserId);
      const user = userMap.get(link.contractorUserId);
      const client = clientMap.get(link.clientId);

      if (!existing) {
        resultMap.set(link.contractorUserId, {
          userId: link.contractorUserId,
          userName: user?.name ?? `User #${link.contractorUserId}`,
          userEmail: user?.email ?? '',
          clientId: link.clientId,
          clientName: client?.clientName ?? null,
          branches: link.branch
            ? [{ id: link.branch.id, name: link.branch.branchName ?? '' }]
            : [],
        });
      } else if (link.branch) {
        existing.branches.push({
          id: link.branch.id,
          name: link.branch.branchName ?? '',
        });
      }
    }

    return Array.from(resultMap.values());
  }
}
