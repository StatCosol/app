import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmployeeAppraisalEntity } from '../entities/employee-appraisal.entity';
import { EmployeeAppraisalItemEntity } from '../entities/employee-appraisal-item.entity';
import { AppraisalApprovalEntity } from '../entities/appraisal-approval.entity';
import { AppraisalAuditLogEntity } from '../entities/appraisal-audit-log.entity';
import { AppraisalRatingScaleItemEntity } from '../entities/appraisal-rating-scale-item.entity';
import { AppraisalCycleEntity } from '../entities/appraisal-cycle.entity';
import {
  ManagerReviewDto,
  BranchReviewDto,
  ClientApproveDto,
  AppraisalFilterDto,
} from '../dto/employee-appraisal.dto';

@Injectable()
export class EmployeeAppraisalsService {
  constructor(
    @InjectRepository(EmployeeAppraisalEntity)
    private readonly appraisalRepo: Repository<EmployeeAppraisalEntity>,
    @InjectRepository(EmployeeAppraisalItemEntity)
    private readonly itemRepo: Repository<EmployeeAppraisalItemEntity>,
    @InjectRepository(AppraisalApprovalEntity)
    private readonly approvalRepo: Repository<AppraisalApprovalEntity>,
    @InjectRepository(AppraisalAuditLogEntity)
    private readonly auditRepo: Repository<AppraisalAuditLogEntity>,
    @InjectRepository(AppraisalRatingScaleItemEntity)
    private readonly ratingScaleItemRepo: Repository<AppraisalRatingScaleItemEntity>,
    @InjectRepository(AppraisalCycleEntity)
    private readonly cycleRepo: Repository<AppraisalCycleEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(filter: AppraisalFilterDto) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;

    let query = `
      SELECT ea.*, e.employee_code, e.name AS employee_name, e.department, e.designation,
             e.date_of_joining, e.ctc, e.monthly_gross, e.branch_id,
             b.branchname AS branch_name, ac.cycle_name, ac.financial_year
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      JOIN appraisal_cycles ac ON ea.cycle_id = ac.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 0;

    if (filter.clientId) {
      params.push(filter.clientId);
      paramIdx++;
      query += ` AND ea.client_id = $${paramIdx}`;
    }
    if (filter.branchId) {
      params.push(filter.branchId);
      paramIdx++;
      query += ` AND ea.branch_id = $${paramIdx}`;
    }
    if (filter.cycleId) {
      params.push(filter.cycleId);
      paramIdx++;
      query += ` AND ea.cycle_id = $${paramIdx}`;
    }
    if (filter.status) {
      params.push(filter.status);
      paramIdx++;
      query += ` AND ea.status = $${paramIdx}`;
    }
    if (filter.recommendation) {
      params.push(filter.recommendation);
      paramIdx++;
      query += ` AND ea.recommendation = $${paramIdx}`;
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      paramIdx++;
      query += ` AND (e.name ILIKE $${paramIdx} OR e.employee_code ILIKE $${paramIdx})`;
    }

    // Count
    const countQuery = `SELECT COUNT(*)::int AS total FROM (${query}) sub`;
    const [{ total }] = await this.dataSource.query(countQuery, params);

    // Paginate
    query += ` ORDER BY ea.created_at DESC`;
    params.push(pageSize);
    paramIdx++;
    query += ` LIMIT $${paramIdx}`;
    params.push((page - 1) * pageSize);
    paramIdx++;
    query += ` OFFSET $${paramIdx}`;

    const rows = await this.dataSource.query(query, params);

    return { data: rows, total, page, pageSize };
  }

  async findOne(id: string) {
    const appraisal = await this.dataSource.query(
      `
      SELECT ea.*, e.employee_code, e.name AS employee_name, e.department, e.designation,
             e.date_of_joining, e.ctc, e.monthly_gross, e.phone, e.email, e.gender,
             e.branch_id, b.branchname AS branch_name, ac.cycle_name, ac.financial_year,
             ac.review_period_from, ac.review_period_to
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      JOIN appraisal_cycles ac ON ea.cycle_id = ac.id
      WHERE ea.id = $1
    `,
      [id],
    );

    if (!appraisal.length) throw new NotFoundException('Appraisal not found');

    const items = await this.itemRepo.find({
      where: { employeeAppraisalId: id },
      order: { sequence: 'ASC' },
    });

    const approvals = await this.approvalRepo.find({
      where: { employeeAppraisalId: id },
      order: { actionAt: 'ASC' },
    });

    return { ...appraisal[0], items, approvals };
  }

  async managerReview(id: string, dto: ManagerReviewDto, userId: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (appraisal.lockedAt)
      throw new BadRequestException('Appraisal is locked');

    // Update item ratings
    for (const item of dto.items) {
      if (item.itemId) {
        await this.itemRepo.update(
          { id: item.itemId },
          {
            managerRating: item.rating ?? null,
            managerRemarks: item.remarks ?? null,
            targetValue: item.targetValue ?? undefined,
            achievementValue: item.achievementValue ?? undefined,
          },
        );
      }
    }

    // Recalculate scores
    await this.recalculateScores(id, 'manager');

    const oldStatus = appraisal.status;
    appraisal.managerStatus = 'REVIEWED';
    appraisal.status = 'MANAGER_REVIEWED';
    appraisal.recommendation = dto.recommendation ?? appraisal.recommendation;
    appraisal.recommendedIncrementPercent =
      dto.recommendedIncrementPercent ?? appraisal.recommendedIncrementPercent;
    appraisal.recommendedNewCtc =
      dto.recommendedNewCtc ?? appraisal.recommendedNewCtc;
    appraisal.pipRequired = dto.pipRequired ?? appraisal.pipRequired;
    appraisal.finalRemarks = dto.remarks ?? appraisal.finalRemarks;
    await this.appraisalRepo.save(appraisal);

    await this.logApproval(id, 'MANAGER', userId, 'REVIEWED', dto.remarks);
    await this.logAudit(
      id,
      'MANAGER_REVIEW',
      oldStatus,
      appraisal.status,
      userId,
    );

    return this.findOne(id);
  }

  async branchReview(id: string, dto: BranchReviewDto, userId: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (appraisal.lockedAt)
      throw new BadRequestException('Appraisal is locked');

    for (const item of dto.items) {
      if (item.itemId) {
        await this.itemRepo.update(
          { id: item.itemId },
          {
            branchRating: item.rating ?? null,
            branchRemarks: item.remarks ?? null,
          },
        );
      }
    }

    await this.recalculateScores(id, 'branch');

    const oldStatus = appraisal.status;
    appraisal.branchStatus = 'REVIEWED';
    appraisal.status = 'BRANCH_REVIEWED';
    appraisal.recommendation = dto.recommendation ?? appraisal.recommendation;
    appraisal.recommendedIncrementPercent =
      dto.recommendedIncrementPercent ?? appraisal.recommendedIncrementPercent;
    appraisal.recommendedNewCtc =
      dto.recommendedNewCtc ?? appraisal.recommendedNewCtc;
    appraisal.pipRequired = dto.pipRequired ?? appraisal.pipRequired;
    appraisal.finalRemarks = dto.remarks ?? appraisal.finalRemarks;
    await this.appraisalRepo.save(appraisal);

    await this.logApproval(id, 'BRANCH', userId, 'REVIEWED', dto.remarks);
    await this.logAudit(
      id,
      'BRANCH_REVIEW',
      oldStatus,
      appraisal.status,
      userId,
    );

    return this.findOne(id);
  }

  async clientApprove(id: string, dto: ClientApproveDto, userId: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (appraisal.lockedAt)
      throw new BadRequestException('Appraisal is locked');

    const oldStatus = appraisal.status;

    if (dto.action === 'APPROVE') {
      appraisal.clientStatus = 'APPROVED';
      appraisal.status = 'CLIENT_APPROVED';
      appraisal.recommendation = dto.recommendation ?? appraisal.recommendation;
      appraisal.recommendedIncrementPercent =
        dto.recommendedIncrementPercent ??
        appraisal.recommendedIncrementPercent;
      appraisal.recommendedNewCtc =
        dto.recommendedNewCtc ?? appraisal.recommendedNewCtc;

      // Resolve final rating from scale
      await this.resolveFinalRating(appraisal);
    } else if (dto.action === 'REJECT') {
      appraisal.clientStatus = 'REJECTED';
      appraisal.status = 'REJECTED';
    } else if (dto.action === 'SEND_BACK') {
      appraisal.status = 'SENT_BACK';
    }

    appraisal.finalRemarks = dto.remarks ?? appraisal.finalRemarks;
    await this.appraisalRepo.save(appraisal);

    await this.logApproval(id, 'CLIENT', userId, dto.action, dto.remarks);
    await this.logAudit(
      id,
      `CLIENT_${dto.action}`,
      oldStatus,
      appraisal.status,
      userId,
    );

    return this.findOne(id);
  }

  async sendBack(id: string, remarks: string, userId: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');

    const oldStatus = appraisal.status;
    appraisal.status = 'SENT_BACK';
    await this.appraisalRepo.save(appraisal);

    await this.logApproval(id, 'BRANCH', userId, 'SENT_BACK', remarks);
    await this.logAudit(id, 'SENT_BACK', oldStatus, 'SENT_BACK', userId);

    return { ok: true };
  }

  async lock(id: string, userId: string) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (appraisal.status !== 'CLIENT_APPROVED')
      throw new BadRequestException('Only approved appraisals can be locked');

    appraisal.lockedAt = new Date();
    appraisal.status = 'LOCKED';
    await this.appraisalRepo.save(appraisal);

    await this.logAudit(id, 'LOCKED', 'CLIENT_APPROVED', 'LOCKED', userId);
    return { ok: true };
  }

  async getHistory(id: string) {
    return this.auditRepo.find({
      where: { employeeAppraisalId: id },
      order: { changedAt: 'ASC' },
    });
  }

  async getDashboard(clientId: string, branchId?: string) {
    let where = 'ea.client_id = $1';
    const params: any[] = [clientId];
    if (branchId) {
      where += ' AND ea.branch_id = $2';
      params.push(branchId);
    }

    const [summary] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ea.status = 'INITIATED')::int AS initiated,
        COUNT(*) FILTER (WHERE ea.status = 'MANAGER_REVIEWED')::int AS manager_reviewed,
        COUNT(*) FILTER (WHERE ea.status = 'BRANCH_REVIEWED')::int AS branch_reviewed,
        COUNT(*) FILTER (WHERE ea.status = 'CLIENT_APPROVED')::int AS client_approved,
        COUNT(*) FILTER (WHERE ea.status = 'SENT_BACK')::int AS sent_back,
        COUNT(*) FILTER (WHERE ea.status IN ('LOCKED','CLOSED'))::int AS closed,
        COUNT(*) FILTER (WHERE ea.status NOT IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS pending,
        ROUND(AVG(ea.total_score)::numeric, 2) AS avg_score,
        COUNT(*) FILTER (WHERE ea.recommendation = 'INCREMENT')::int AS increment_recommended,
        COUNT(*) FILTER (WHERE ea.recommendation = 'PROMOTION')::int AS promotion_recommended,
        COUNT(*) FILTER (WHERE ea.recommendation = 'PIP')::int AS pip_recommended,
        COUNT(*) FILTER (WHERE ea.pip_required = true)::int AS pip_count
      FROM employee_appraisals ea
      WHERE ${where}
    `,
      params,
    );

    // Top performers
    const topPerformers = await this.dataSource.query(
      `
      SELECT ea.total_score, ea.final_rating_label, e.name, e.employee_code, b.branchname AS branch_name
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      WHERE ${where} AND ea.total_score IS NOT NULL
      ORDER BY ea.total_score DESC LIMIT 10
    `,
      params,
    );

    // Low performers
    const lowPerformers = await this.dataSource.query(
      `
      SELECT ea.total_score, ea.final_rating_label, e.name, e.employee_code, b.branchname AS branch_name
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      WHERE ${where} AND ea.total_score IS NOT NULL
      ORDER BY ea.total_score ASC LIMIT 10
    `,
      params,
    );

    // Branch-wise summary
    const branchSummary = await this.dataSource.query(
      `
      SELECT b.branchname AS branch_name, COUNT(*)::int AS total,
             ROUND(AVG(ea.total_score)::numeric, 2) AS avg_score,
             COUNT(*) FILTER (WHERE ea.status IN ('CLIENT_APPROVED','LOCKED','CLOSED'))::int AS completed
      FROM employee_appraisals ea
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      WHERE ${where.replace('ea.branch_id = $2', '1=1')}
      GROUP BY b.branchname ORDER BY avg_score DESC NULLS LAST
    `,
      [clientId],
    );

    return { summary, topPerformers, lowPerformers, branchSummary };
  }

  // ── ESS Self-Review ──

  async findByEmployee(employeeId: string) {
    const rows = await this.dataSource.query(
      `
      SELECT ea.*, e.employee_code, e.name AS employee_name, e.department, e.designation,
             e.date_of_joining, b.branchname AS branch_name, ac.cycle_name, ac.financial_year
      FROM employee_appraisals ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN client_branches b ON ea.branch_id = b.id
      JOIN appraisal_cycles ac ON ea.cycle_id = ac.id
      WHERE ea.employee_id = $1
      ORDER BY ea.created_at DESC
    `,
      [employeeId],
    );
    return rows;
  }

  async selfReview(
    id: string,
    items: { itemId: string; rating: number; remarks?: string }[],
    employeeId: string,
  ) {
    const appraisal = await this.appraisalRepo.findOne({ where: { id } });
    if (!appraisal) throw new NotFoundException('Appraisal not found');
    if (appraisal.employeeId !== employeeId)
      throw new BadRequestException('This appraisal does not belong to you');
    if (appraisal.lockedAt)
      throw new BadRequestException('Appraisal is locked');
    if (!['INITIATED', 'SENT_BACK'].includes(appraisal.status))
      throw new BadRequestException(
        'Self-review is not allowed in current status',
      );

    for (const item of items) {
      if (item.itemId) {
        await this.itemRepo.update(
          { id: item.itemId, employeeAppraisalId: id },
          {
            selfRating: item.rating ?? null,
            employeeRemarks: item.remarks ?? null,
          },
        );
      }
    }

    const oldStatus = appraisal.status;
    appraisal.selfStatus = 'SUBMITTED';
    appraisal.status = 'SELF_SUBMITTED';
    await this.appraisalRepo.save(appraisal);

    await this.logApproval(
      id,
      'SELF',
      employeeId,
      'SUBMITTED',
      'Self-review submitted',
    );
    await this.logAudit(
      id,
      'SELF_REVIEW',
      oldStatus,
      appraisal.status,
      employeeId,
    );

    return this.findOne(id);
  }

  // ── Private helpers ──

  private async recalculateScores(
    appraisalId: string,
    level: 'manager' | 'branch',
  ) {
    const ratingCol = level === 'manager' ? 'manager_rating' : 'branch_rating';
    await this.dataSource.query(
      `
      UPDATE employee_appraisal_items
      SET weighted_score = CASE WHEN weightage > 0 AND ${ratingCol} IS NOT NULL
                                THEN ROUND((${ratingCol} * weightage / 100)::numeric, 2)
                                ELSE NULL END,
          final_rating = ${ratingCol}
      WHERE employee_appraisal_id = $1
    `,
      [appraisalId],
    );

    // Update totals on parent
    const [scores] = await this.dataSource.query(
      `
      SELECT ROUND(SUM(weighted_score)::numeric, 2) AS total_score
      FROM employee_appraisal_items
      WHERE employee_appraisal_id = $1 AND weighted_score IS NOT NULL
    `,
      [appraisalId],
    );

    await this.appraisalRepo.update(
      { id: appraisalId },
      {
        totalScore: scores?.total_score ?? null,
      },
    );
  }

  private async resolveFinalRating(appraisal: EmployeeAppraisalEntity) {
    if (!appraisal.totalScore) return;

    // Find matching rating scale item via the cycle's template
    const cycle = await this.cycleRepo.findOne({
      where: { id: appraisal.cycleId },
    });
    if (!cycle?.templateId) return;

    const scaleItems = await this.dataSource.query(
      `
      SELECT rsi.* FROM appraisal_rating_scale_items rsi
      JOIN appraisal_templates t ON t.rating_scale_id = rsi.scale_id
      WHERE t.id = $1
      ORDER BY rsi.min_score ASC
    `,
      [cycle.templateId],
    );

    for (const si of scaleItems) {
      if (
        appraisal.totalScore >= Number(si.min_score) &&
        appraisal.totalScore <= Number(si.max_score)
      ) {
        appraisal.finalRatingCode = si.rating_code;
        appraisal.finalRatingLabel = si.rating_label;
        break;
      }
    }
  }

  private async logApproval(
    appraisalId: string,
    level: string,
    userId: string,
    action: string,
    remarks?: string,
  ) {
    await this.approvalRepo.save({
      employeeAppraisalId: appraisalId,
      approvalLevel: level,
      approverId: userId,
      action,
      remarks: remarks ?? null,
    });
  }

  private async logAudit(
    appraisalId: string,
    action: string,
    oldStatus: string,
    newStatus: string,
    userId: string,
  ) {
    await this.auditRepo.save({
      employeeAppraisalId: appraisalId,
      action,
      oldStatus,
      newStatus,
      changedBy: userId,
    });
  }
}
