import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, IsNull, Not, Repository } from 'typeorm';
import { LeadEntity } from './entities/lead.entity';
import { LeadActivityEntity } from './entities/lead-activity.entity';
import {
  LeadActivityOutcome,
  LeadActivityType,
  LeadStage,
  OPEN_LEAD_STAGES,
} from './enums/lead.enums';
import {
  CreateLeadActivityDto,
  CreateLeadDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from './dto/lead.dto';

const TERMINAL_STAGES = new Set<LeadStage>([LeadStage.WON, LeadStage.LOST]);

interface AuthUser {
  id: string;
  userId: string;
  roleCode?: string | null;
  email?: string | null;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(LeadEntity)
    private readonly leadRepo: Repository<LeadEntity>,
    @InjectRepository(LeadActivityEntity)
    private readonly activityRepo: Repository<LeadActivityEntity>,
    private readonly ds: DataSource,
  ) {}

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private isAdminOrCeo(user: AuthUser): boolean {
    return user.roleCode === 'ADMIN' || user.roleCode === 'CEO';
  }

  private async assertCanMutate(
    user: AuthUser,
    lead: LeadEntity,
  ): Promise<void> {
    if (this.isAdminOrCeo(user)) return;
    if (user.roleCode !== 'SALES') {
      throw new ForbiddenException('Only SALES users can modify leads');
    }
    if (lead.ownerUserId && lead.ownerUserId !== user.id) {
      throw new ForbiddenException('Lead is owned by another sales user');
    }
  }

  private async generateLeadNo(): Promise<string> {
    const year = new Date().getFullYear();
    // Count existing leads created this year for the running serial.
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const count = await this.leadRepo
      .createQueryBuilder('l')
      .where('l.createdAt >= :start AND l.createdAt < :end', { start, end })
      .getCount();
    const serial = String(count + 1).padStart(4, '0');
    return `LEAD-${year}-${serial}`;
  }

  // ---------------------------------------------------------------------
  // Leads CRUD
  // ---------------------------------------------------------------------

  async create(user: AuthUser, dto: CreateLeadDto): Promise<LeadEntity> {
    if (user.roleCode !== 'SALES' && !this.isAdminOrCeo(user)) {
      throw new ForbiddenException('Only SALES/ADMIN can create leads');
    }
    const lead = this.leadRepo.create({
      ...dto,
      estimatedValue: (dto.estimatedValue ?? 0).toString(),
      ownerUserId: dto.ownerUserId ?? user.id,
      createdBy: user.id,
      updatedBy: user.id,
      leadNo: await this.generateLeadNo(),
    });
    return this.leadRepo.save(lead);
  }

  async list(user: AuthUser, q: ListLeadsQueryDto) {
    const where: Record<string, unknown> = {};
    const bucket = q.bucket ?? 'open';
    if (bucket === 'open') {
      where.stage = In(OPEN_LEAD_STAGES);
      where.isArchived = false;
    } else if (bucket === 'won') {
      where.stage = LeadStage.WON;
    } else if (bucket === 'lost') {
      where.stage = LeadStage.LOST;
    } else if (bucket === 'archived') {
      where.isArchived = true;
    }
    if (q.stage) where.stage = q.stage;
    if (q.priority) where.priority = q.priority;
    if (q.source) where.source = q.source;
    if (q.ownerUserId) where.ownerUserId = q.ownerUserId;
    if (q.search) where.companyName = ILike(`%${q.search}%`);

    // Non-admin/CEO sales users see only their own leads by default.
    if (user.roleCode === 'SALES' && !q.ownerUserId) {
      where.ownerUserId = user.id;
    }

    const limit = Math.min(q.limit ?? 100, 500);
    const offset = q.offset ?? 0;

    const [items, total] = await this.leadRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total, limit, offset };
  }

  async findOne(user: AuthUser, id: string): Promise<LeadEntity> {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (
      user.roleCode === 'SALES' &&
      lead.ownerUserId &&
      lead.ownerUserId !== user.id
    ) {
      throw new ForbiddenException('Lead is owned by another sales user');
    }
    return lead;
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateLeadDto,
  ): Promise<LeadEntity> {
    const lead = await this.findOne(user, id);
    await this.assertCanMutate(user, lead);
    Object.assign(lead, {
      ...dto,
      estimatedValue:
        dto.estimatedValue != null
          ? dto.estimatedValue.toString()
          : lead.estimatedValue,
      updatedBy: user.id,
    });
    if (
      dto.stage &&
      TERMINAL_STAGES.has(dto.stage) &&
      !lead.convertedAt &&
      dto.stage === LeadStage.WON
    ) {
      lead.convertedAt = new Date();
    }
    return this.leadRepo.save(lead);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const lead = await this.findOne(user, id);
    if (!this.isAdminOrCeo(user)) {
      throw new ForbiddenException('Only ADMIN/CEO can delete leads');
    }
    await this.leadRepo.delete({ id: lead.id });
  }

  // ---------------------------------------------------------------------
  // Activities
  // ---------------------------------------------------------------------

  async addActivity(
    user: AuthUser,
    leadId: string,
    dto: CreateLeadActivityDto,
  ): Promise<LeadActivityEntity> {
    const lead = await this.findOne(user, leadId);
    await this.assertCanMutate(user, lead);
    const activity = this.activityRepo.create({
      leadId: lead.id,
      activityType: dto.activityType,
      outcome: dto.outcome ?? null,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      nextFollowupAt: dto.nextFollowupAt ? new Date(dto.nextFollowupAt) : null,
      durationMinutes: dto.durationMinutes ?? null,
      subject: dto.subject ?? null,
      notes: dto.notes ?? null,
      attachmentUrl: dto.attachmentUrl ?? null,
      performedBy: user.id,
    });
    const saved = await this.activityRepo.save(activity);

    // Auto-progress stage on certain outcomes.
    if (dto.outcome === LeadActivityOutcome.PROPOSAL_SENT) {
      lead.stage = LeadStage.PROPOSAL_SENT;
    } else if (dto.outcome === LeadActivityOutcome.AGREEMENT_SIGNED) {
      lead.stage = LeadStage.WON;
      if (!lead.convertedAt) lead.convertedAt = new Date();
    } else if (dto.outcome === LeadActivityOutcome.DECLINED) {
      lead.stage = LeadStage.LOST;
    } else if (
      dto.outcome === LeadActivityOutcome.INTERESTED &&
      lead.stage === LeadStage.NEW
    ) {
      lead.stage = LeadStage.QUALIFIED;
    }
    if (
      lead.stage === LeadStage.NEW &&
      dto.activityType !== LeadActivityType.NOTE
    ) {
      lead.stage = LeadStage.CONTACTED;
    }
    lead.updatedBy = user.id;
    await this.leadRepo.save(lead);
    return saved;
  }

  async listActivities(
    user: AuthUser,
    leadId: string,
  ): Promise<LeadActivityEntity[]> {
    await this.findOne(user, leadId);
    return this.activityRepo.find({
      where: { leadId },
      order: { occurredAt: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------
  // Sales-side dashboards
  // ---------------------------------------------------------------------

  async myFollowups(user: AuthUser) {
    const now = new Date();
    const overdue = await this.leadRepo.find({
      where: {
        ownerUserId: user.id,
        isArchived: false,
        stage: In(OPEN_LEAD_STAGES),
        nextFollowupAt: Not(IsNull()),
      },
      order: { nextFollowupAt: 'ASC' },
      take: 200,
    });
    return overdue.filter(
      (l) => l.nextFollowupAt && l.nextFollowupAt.getTime() <= now.getTime(),
    );
  }

  // ---------------------------------------------------------------------
  // CEO summary aggregations
  // ---------------------------------------------------------------------

  async ceoPipelineSummary() {
    const stageRows = await this.ds.query<
      Array<{ stage: string; count: string; value: string }>
    >(
      `SELECT stage::text AS stage, COUNT(*)::text AS count,
              COALESCE(SUM(estimated_value),0)::text AS value
         FROM leads
        WHERE is_archived = false
        GROUP BY stage`,
    );

    const totals = await this.ds.query<
      Array<{
        open_count: string;
        won_count: string;
        lost_count: string;
        open_value: string;
        won_value: string;
      }>
    >(
      `SELECT
         COUNT(*) FILTER (WHERE stage NOT IN ('WON','LOST') AND is_archived = false)::text AS open_count,
         COUNT(*) FILTER (WHERE stage = 'WON')::text  AS won_count,
         COUNT(*) FILTER (WHERE stage = 'LOST')::text AS lost_count,
         COALESCE(SUM(estimated_value) FILTER (WHERE stage NOT IN ('WON','LOST') AND is_archived = false),0)::text AS open_value,
         COALESCE(SUM(estimated_value) FILTER (WHERE stage = 'WON'),0)::text AS won_value
        FROM leads`,
    );

    const ownerRows = await this.ds.query<
      Array<{
        owner_user_id: string | null;
        owner_name: string | null;
        total: string;
        open: string;
        won: string;
        lost: string;
        open_value: string;
      }>
    >(
      `SELECT l.owner_user_id, u.name AS owner_name,
              COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE l.stage NOT IN ('WON','LOST') AND l.is_archived = false)::text AS open,
              COUNT(*) FILTER (WHERE l.stage = 'WON')::text  AS won,
              COUNT(*) FILTER (WHERE l.stage = 'LOST')::text AS lost,
              COALESCE(SUM(l.estimated_value) FILTER (WHERE l.stage NOT IN ('WON','LOST') AND l.is_archived = false),0)::text AS open_value
         FROM leads l
         LEFT JOIN users u ON u.id = l.owner_user_id
        GROUP BY l.owner_user_id, u.name
        ORDER BY open DESC NULLS LAST, total DESC`,
    );

    return {
      byStage: stageRows.map((r) => ({
        stage: r.stage,
        count: Number(r.count),
        value: Number(r.value),
      })),
      totals: totals[0]
        ? {
            openCount: Number(totals[0].open_count),
            wonCount: Number(totals[0].won_count),
            lostCount: Number(totals[0].lost_count),
            openValue: Number(totals[0].open_value),
            wonValue: Number(totals[0].won_value),
          }
        : null,
      byOwner: ownerRows.map((r) => ({
        ownerUserId: r.owner_user_id,
        ownerName: r.owner_name,
        total: Number(r.total),
        open: Number(r.open),
        won: Number(r.won),
        lost: Number(r.lost),
        openValue: Number(r.open_value),
      })),
    };
  }

  async ceoFollowups() {
    const rows = await this.ds.query<
      Array<{
        bucket: string;
        id: string;
        lead_no: string | null;
        company_name: string;
        contact_name: string | null;
        contact_phone: string | null;
        stage: string;
        priority: string;
        owner_user_id: string | null;
        owner_name: string | null;
        next_followup_at: Date | null;
        last_activity_at: Date | null;
        created_at: Date;
        estimated_value: string;
        days_since_activity: string | null;
      }>
    >(
      `WITH base AS (
         SELECT l.*, u.name AS owner_name,
                EXTRACT(EPOCH FROM (now() - COALESCE(l.last_activity_at, l.created_at)))/86400 AS days_since_activity
           FROM leads l
           LEFT JOIN users u ON u.id = l.owner_user_id
          WHERE l.is_archived = false
            AND l.stage NOT IN ('WON','LOST')
       )
       SELECT 'OVERDUE_FOLLOWUP'::text AS bucket, b.id, b.lead_no, b.company_name, b.contact_name, b.contact_phone,
              b.stage::text, b.priority::text, b.owner_user_id, b.owner_name,
              b.next_followup_at, b.last_activity_at, b.created_at, b.estimated_value::text,
              b.days_since_activity::text
         FROM base b
        WHERE b.next_followup_at IS NOT NULL AND b.next_followup_at <= now()
       UNION ALL
       SELECT 'AWAITING_AGREEMENT'::text, b.id, b.lead_no, b.company_name, b.contact_name, b.contact_phone,
              b.stage::text, b.priority::text, b.owner_user_id, b.owner_name,
              b.next_followup_at, b.last_activity_at, b.created_at, b.estimated_value::text,
              b.days_since_activity::text
         FROM base b
        WHERE b.stage IN ('PROPOSAL_SENT','AGREEMENT_SENT','NEGOTIATION')
          AND COALESCE(b.last_activity_at, b.created_at) < now() - interval '7 days'
       UNION ALL
       SELECT 'STALE'::text, b.id, b.lead_no, b.company_name, b.contact_name, b.contact_phone,
              b.stage::text, b.priority::text, b.owner_user_id, b.owner_name,
              b.next_followup_at, b.last_activity_at, b.created_at, b.estimated_value::text,
              b.days_since_activity::text
         FROM base b
        WHERE COALESCE(b.last_activity_at, b.created_at) < now() - interval '14 days'
       UNION ALL
       SELECT 'NEVER_CONTACTED'::text, b.id, b.lead_no, b.company_name, b.contact_name, b.contact_phone,
              b.stage::text, b.priority::text, b.owner_user_id, b.owner_name,
              b.next_followup_at, b.last_activity_at, b.created_at, b.estimated_value::text,
              b.days_since_activity::text
         FROM base b
        WHERE b.last_activity_at IS NULL AND b.created_at < now() - interval '24 hours'
       ORDER BY 1, days_since_activity DESC NULLS LAST
       LIMIT 500`,
    );

    const buckets: Record<string, typeof rows> = {};
    for (const r of rows) {
      buckets[r.bucket] = buckets[r.bucket] ?? [];
      buckets[r.bucket].push(r);
    }
    return {
      buckets: Object.fromEntries(
        Object.entries(buckets).map(([k, list]) => [
          k,
          list.map((r) => ({
            id: r.id,
            leadNo: r.lead_no,
            companyName: r.company_name,
            contactName: r.contact_name,
            contactPhone: r.contact_phone,
            stage: r.stage,
            priority: r.priority,
            ownerUserId: r.owner_user_id,
            ownerName: r.owner_name,
            nextFollowupAt: r.next_followup_at,
            lastActivityAt: r.last_activity_at,
            createdAt: r.created_at,
            estimatedValue: Number(r.estimated_value),
            daysSinceActivity:
              r.days_since_activity != null
                ? Number(r.days_since_activity)
                : null,
          })),
        ]),
      ),
      counts: Object.fromEntries(
        Object.entries(buckets).map(([k, list]) => [k, list.length]),
      ),
    };
  }

  // ---------------------------------------------------------------------
  // CEO Receivables (AR aging)
  // ---------------------------------------------------------------------

  async ceoReceivables() {
    const rows = await this.ds.query<
      Array<{
        bucket: string;
        invoice_count: string;
        balance: string;
      }>
    >(
      `WITH open AS (
         SELECT i.id, i.balance_outstanding, i.due_date,
                CASE
                  WHEN i.due_date IS NULL THEN 'NO_DUE_DATE'
                  WHEN now()::date <= i.due_date THEN 'CURRENT'
                  WHEN now()::date - i.due_date BETWEEN 1 AND 30  THEN 'D_1_30'
                  WHEN now()::date - i.due_date BETWEEN 31 AND 60 THEN 'D_31_60'
                  WHEN now()::date - i.due_date BETWEEN 61 AND 90 THEN 'D_61_90'
                  ELSE 'D_90_PLUS'
                END AS bucket
           FROM invoices i
          WHERE i.payment_status IN ('UNPAID','PARTIALLY_PAID')
            AND i.invoice_status NOT IN ('DRAFT','CANCELLED')
            AND COALESCE(i.balance_outstanding,0) > 0
       )
       SELECT bucket,
              COUNT(*)::text AS invoice_count,
              COALESCE(SUM(balance_outstanding),0)::text AS balance
         FROM open
        GROUP BY bucket`,
    );

    const totals = await this.ds.query<
      Array<{
        open_invoices: string;
        outstanding: string;
        overdue_amount: string;
      }>
    >(
      `SELECT COUNT(*)::text AS open_invoices,
              COALESCE(SUM(balance_outstanding),0)::text AS outstanding,
              COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND now()::date > due_date THEN balance_outstanding ELSE 0 END),0)::text AS overdue_amount
         FROM invoices
        WHERE payment_status IN ('UNPAID','PARTIALLY_PAID')
          AND invoice_status NOT IN ('DRAFT','CANCELLED')
          AND COALESCE(balance_outstanding,0) > 0`,
    );

    const topClients = await this.ds.query<
      Array<{
        billing_client_id: string;
        client_name: string | null;
        outstanding: string;
        overdue: string;
        invoice_count: string;
      }>
    >(
      `SELECT i.billing_client_id,
              COALESCE(bc.trade_name, bc.legal_name) AS client_name,
              COALESCE(SUM(i.balance_outstanding),0)::text AS outstanding,
              COALESCE(SUM(CASE WHEN i.due_date IS NOT NULL AND now()::date > i.due_date THEN i.balance_outstanding ELSE 0 END),0)::text AS overdue,
              COUNT(*)::text AS invoice_count
         FROM invoices i
         LEFT JOIN billing_clients bc ON bc.id = i.billing_client_id
        WHERE i.payment_status IN ('UNPAID','PARTIALLY_PAID')
          AND i.invoice_status NOT IN ('DRAFT','CANCELLED')
          AND COALESCE(i.balance_outstanding,0) > 0
        GROUP BY i.billing_client_id, bc.legal_name, bc.trade_name
        ORDER BY COALESCE(SUM(i.balance_outstanding),0) DESC
        LIMIT 25`,
    );

    return {
      buckets: rows.map((r) => ({
        bucket: r.bucket,
        invoiceCount: Number(r.invoice_count),
        balance: Number(r.balance),
      })),
      totals: totals[0]
        ? {
            openInvoices: Number(totals[0].open_invoices),
            outstanding: Number(totals[0].outstanding),
            overdueAmount: Number(totals[0].overdue_amount),
          }
        : { openInvoices: 0, outstanding: 0, overdueAmount: 0 },
      topClients: topClients.map((r) => ({
        billingClientId: r.billing_client_id,
        clientName: r.client_name,
        outstanding: Number(r.outstanding),
        overdue: Number(r.overdue),
        invoiceCount: Number(r.invoice_count),
      })),
    };
  }
}
