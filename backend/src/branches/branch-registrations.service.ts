import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BranchRegistrationEntity } from './entities/branch-registration.entity';
import { BranchEntity } from './entities/branch.entity';
import { CreateBranchRegistrationDto } from './dto/create-branch-registration.dto';
import { UpdateBranchRegistrationDto } from './dto/update-branch-registration.dto';

@Injectable()
export class BranchRegistrationsService {
  constructor(
    @InjectRepository(BranchRegistrationEntity)
    private readonly regRepo: Repository<BranchRegistrationEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List registrations for a branch, with computed status based on expiry_date.
   * Returns items sorted by urgency (expired first, then expiring soon, then active).
   */
  async listByBranch(branchId: string, clientId: string) {
    // Validate branch belongs to client
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false },
    });
    if (!branch || branch.clientId !== clientId) {
      throw new NotFoundException('Branch not found for this client');
    }

    const rows: any[] = await this.dataSource.query(
      `SELECT
        r.id,
        r.type,
        r.registration_number  AS "registrationNumber",
        r.authority,
        r.issued_date          AS "issuedDate",
        r.expiry_date          AS "expiryDate",
        r.document_path        AS "documentPath",
        r.document_url         AS "documentUrl",
        r.renewal_document_url AS "renewalDocumentUrl",
        r.renewed_on           AS "renewedOn",
        r.remarks,
        r.created_at           AS "createdAt",
        CASE
          WHEN r.expiry_date IS NULL          THEN 'ACTIVE'
          WHEN r.expiry_date < CURRENT_DATE   THEN 'EXPIRED'
          WHEN r.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
          ELSE 'ACTIVE'
        END AS "computedStatus",
        CASE
          WHEN r.expiry_date IS NULL THEN 99999
          ELSE (r.expiry_date - CURRENT_DATE)
        END AS "daysRemaining"
      FROM branch_registrations r
      WHERE r.branch_id = $1
        AND r.client_id = $2
        AND COALESCE(r.status, 'ACTIVE') <> 'DELETED'
      ORDER BY
        CASE
          WHEN r.expiry_date IS NULL          THEN 3
          WHEN r.expiry_date < CURRENT_DATE   THEN 1
          WHEN r.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 2
          ELSE 3
        END,
        r.expiry_date ASC NULLS LAST`,
      [branchId, clientId],
    );

    return rows;
  }

  /* ── CRUD (CRM / Admin) ─────────────────────────── */

  private async assertBranchBelongsToClient(
    branchId: string,
    clientId: string,
  ) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false },
    });
    if (!branch || branch.clientId !== clientId) {
      throw new NotFoundException('Branch not found for this client');
    }
  }

  async create(
    dto: CreateBranchRegistrationDto,
    clientId: string,
    userId: string,
  ) {
    await this.assertBranchBelongsToClient(dto.branchId, clientId);

    const entity = this.regRepo.create({
      clientId,
      branchId: dto.branchId,
      type: dto.type,
      registrationNumber: dto.registrationNumber ?? null,
      authority: dto.authority ?? null,
      issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      createdBy: userId,
    });

    return this.regRepo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateBranchRegistrationDto,
    clientId: string,
    _userId: string,
  ) {
    const row = await this.regRepo.findOne({ where: { id, clientId } });
    if (!row) throw new NotFoundException('Registration not found');

    if (dto.branchId && dto.branchId !== row.branchId) {
      await this.assertBranchBelongsToClient(dto.branchId, clientId);
      row.branchId = dto.branchId;
    }

    // Renewal detection: if expiry date is extended, mark as renewed
    if (dto.expiryDate !== undefined) {
      const newExpiry = dto.expiryDate ? new Date(dto.expiryDate) : null;
      const oldExpiry = row.expiryDate ? new Date(row.expiryDate) : null;
      if (newExpiry && oldExpiry && newExpiry.getTime() > oldExpiry.getTime()) {
        row.renewedOn = new Date();
      }
    }

    if (dto.type !== undefined) row.type = dto.type;
    if (dto.registrationNumber !== undefined)
      row.registrationNumber = dto.registrationNumber ?? null;
    if (dto.authority !== undefined) row.authority = dto.authority ?? null;
    if (dto.issuedDate !== undefined)
      row.issuedDate = dto.issuedDate ? new Date(dto.issuedDate) : null;
    if (dto.expiryDate !== undefined)
      row.expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;

    return this.regRepo.save(row);
  }

  async remove(id: string, clientId: string, _userId: string) {
    const row = await this.regRepo.findOne({ where: { id, clientId } });
    if (!row) throw new NotFoundException('Registration not found');

    // Soft-delete via status column
    row.status = 'DELETED';
    return this.regRepo.save(row);
  }

  /**
   * Upload registration document (PDF / image).
   * Saves file to disk and stores path in document_url column.
   */
  async uploadFile(
    id: string,
    file: { originalname: string; filename: string; path: string },
    clientId: string,
    _userId: string,
    field: 'document' | 'renewal' = 'document',
  ) {
    const row = await this.regRepo.findOne({ where: { id, clientId } });
    if (!row) throw new NotFoundException('Registration not found');

    const relativePath = file.path.replace(/\\/g, '/');

    if (field === 'renewal') {
      row.renewalDocumentUrl = relativePath;
      row.renewedOn = new Date();
    } else {
      row.documentUrl = relativePath;
    }

    return this.regRepo.save(row);
  }

  /* ── Registration Summary & Compliance Score ─────── */

  /**
   * Get registration summary for a branch (or all branches of a client).
   * Used by dashboards.
   */
  async getRegistrationSummary(clientId: string, branchId?: string) {
    const params: any[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND r.branch_id = $2';
      params.push(branchId);
    }

    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE r.expiry_date IS NULL OR r.expiry_date > CURRENT_DATE + INTERVAL '30 days')::int AS active,
        COUNT(*) FILTER (WHERE r.expiry_date IS NOT NULL AND r.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND r.expiry_date > CURRENT_DATE)::int AS "expiringSoon",
        COUNT(*) FILTER (WHERE r.expiry_date IS NOT NULL AND r.expiry_date < CURRENT_DATE)::int AS expired
      FROM branch_registrations r
      WHERE r.client_id = $1
        AND COALESCE(r.status, 'ACTIVE') <> 'DELETED'
        ${branchFilter}
    `,
      params,
    );

    const { total, active, expiringSoon, expired } = rows[0] || {
      total: 0,
      active: 0,
      expiringSoon: 0,
      expired: 0,
    };

    // Calculate compliance score impact
    const scoreImpact = await this.calculateRegistrationScore(
      clientId,
      branchId,
    );

    return { total, active, expiringSoon, expired, scoreImpact };
  }

  /**
   * Calculate registration compliance score for a branch or entire client.
   * Starts at 100, deductions per registration:
   *   Expired: -15, <=7 days: -8, <=30 days: -5, <=60 days: -2
   */
  async calculateRegistrationScore(
    clientId: string,
    branchId?: string,
  ): Promise<number> {
    const params: any[] = [clientId];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND r.branch_id = $2';
      params.push(branchId);
    }

    const rows: any[] = await this.dataSource.query(
      `
      SELECT
        CASE
          WHEN r.expiry_date IS NULL THEN 99999
          ELSE (r.expiry_date - CURRENT_DATE)
        END AS "daysRemaining"
      FROM branch_registrations r
      WHERE r.client_id = $1
        AND COALESCE(r.status, 'ACTIVE') <> 'DELETED'
        ${branchFilter}
    `,
      params,
    );

    let deduction = 0;
    for (const r of rows) {
      const d = Number(r.daysRemaining);
      if (d === 99999) continue; // no expiry → no impact
      if (d < 0) deduction += 15;
      else if (d <= 7) deduction += 8;
      else if (d <= 30) deduction += 5;
      else if (d <= 60) deduction += 2;
    }

    return Math.max(100 - deduction, 0);
  }

  /**
   * Get alerts for a client (or branch), for in-app notifications.
   */
  async getAlerts(clientId: string, branchId?: string, limit = 50) {
    const params: any[] = [clientId, limit];
    let branchFilter = '';
    if (branchId) {
      branchFilter = 'AND a.branch_id = $3';
      params.push(branchId);
    }

    return this.dataSource.query(
      `
      SELECT
        a.id,
        a.registration_id AS "registrationId",
        a.branch_id       AS "branchId",
        a.alert_type       AS "alertType",
        a.priority,
        a.title,
        a.message,
        a.is_read          AS "isRead",
        a.created_at       AS "createdAt"
      FROM registration_alerts a
      WHERE a.client_id = $1
        ${branchFilter}
      ORDER BY a.created_at DESC
      LIMIT $2
    `,
      params,
    );
  }

  /**
   * List audit observations for a branch.
   * Joins audit_observations → audits WHERE audits.branch_id = :branchId
   */
  async listAuditObservations(branchId: string, clientId: string) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false },
    });
    if (!branch || branch.clientId !== clientId) {
      throw new NotFoundException('Branch not found for this client');
    }

    const rows: any[] = await this.dataSource.query(
      `SELECT
        ao.id,
        COALESCE('AO-' || TO_CHAR(ao.created_at, 'YYYY') || '-' ||
          LPAD(ao.sequence_number::text, 3, '0'),
          'AO-' || SUBSTRING(ao.id::text, 1, 8)
        ) AS "observationRef",
        COALESCE(c.name, 'General')  AS "category",
        ao.observation               AS "description",
        TO_CHAR(ao.created_at, 'DD Mon YYYY') AS "raisedDate",
        COALESCE(TO_CHAR(a.due_date, 'DD Mon YYYY'), '') AS "dueDate",
        CASE
          WHEN ao.risk = 'CRITICAL' THEN 'Critical'
          WHEN ao.risk = 'HIGH'     THEN 'Major'
          ELSE 'Minor'
        END AS "severity",
        CASE
          WHEN ao.status IN ('CLOSED','RESOLVED') THEN 'Closed'
          WHEN ao.status IN ('ACKNOWLEDGED','IN_PROGRESS') THEN 'In Progress'
          ELSE 'Open'
        END AS "status",
        COALESCE(u.name, 'Compliance Team') AS "assignedTo",
        ao.risk,
        ao.consequences,
        ao.compliance_requirements   AS "complianceRequirements",
        a.due_date                   AS "rawDueDate"
      FROM audit_observations ao
      JOIN audits a ON a.id = ao.audit_id
      LEFT JOIN audit_observation_categories c ON c.id = ao.category_id
      LEFT JOIN users u ON u.id = a.assigned_auditor_id
      WHERE a.branch_id = $1
        AND a.client_id = $2
      ORDER BY
        CASE WHEN ao.status NOT IN ('CLOSED','RESOLVED') THEN 0 ELSE 1 END,
        CASE
          WHEN ao.risk = 'CRITICAL' THEN 1
          WHEN ao.risk = 'HIGH'     THEN 2
          WHEN ao.risk = 'MEDIUM'   THEN 3
          ELSE 4
        END,
        ao.created_at DESC`,
      [branchId, clientId],
    );

    return rows;
  }
}
