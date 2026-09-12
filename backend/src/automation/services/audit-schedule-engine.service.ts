import { operationalDate } from '../../common/operational-date';
import { AutomationScope, scopedRows } from '../automation-scope';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export type SupportedAuditType =
  | 'CONTRACTOR_AUDIT'
  | 'FACTORY_AUDIT'
  | 'BRANCH_COMPLIANCE_AUDIT'
  | 'SAFETY_AUDIT'
  | 'PAYROLL_AUDIT'
  | 'CLIENT_LEVEL_AUDIT';

interface CreateScheduleInput {
  clientId: string;
  auditType: SupportedAuditType;
  auditorId: string;
  scheduleDate: Date;
  dueDate?: Date | null;
  branchId?: string | null;
  contractorId?: string | null;
  scheduledByCrmId?: string | null;
  scheduledBySystem?: boolean;
  frequencyRuleId?: string | null;
  remarks?: string | null;
  /**
   * Optional explicit override; when omitted, contractor audits derive it from
   * the contractor's active headcount via {@link computeAuditorSlotHours}.
   */
  auditorSlotHours?: number | null;
}

@Injectable()
export class AuditScheduleEngineService {
  private readonly logger = new Logger(AuditScheduleEngineService.name);

  constructor(private readonly dataSource: DataSource) {}

  async candidates(scope: AutomationScope = {}) {
    const today = new Date(operationalDate() + 'T00:00:00Z');
    const until = new Date(today);
    until.setUTCDate(until.getUTCDate() + (scope.options?.auditDays ?? 30));
    const rules = await scopedRows(
      this.dataSource,
      `SELECT afr.*,afr.audit_type AS title FROM audit_frequency_rules afr
      JOIN clients c ON c.id=afr.client_id
      LEFT JOIN client_branches b ON b.id=afr.branch_id AND b.clientid=afr.client_id
      WHERE afr.is_active=true AND c.is_deleted=false AND (afr.branch_id IS NULL OR b.isactive=true)
      AND NOT EXISTS (SELECT 1 FROM audit_schedules made WHERE made.frequency_rule_id=afr.id AND (made.created_at::timestamptz AT TIME ZONE 'Asia/Kolkata')::date=$1::date)`,
      [operationalDate()],
      scope,
    );
    const candidates: any[] = [];
    for (const rule of rules) {
      const [last] = await this.dataSource.query(
        `SELECT schedule_date FROM audit_schedules WHERE client_id=$1 AND audit_type=$2 AND branch_id IS NOT DISTINCT FROM $3::uuid AND contractor_id IS NOT DISTINCT FROM $4::uuid AND status<>'CANCELLED' ORDER BY schedule_date DESC LIMIT 1`,
        [rule.client_id, rule.audit_type, rule.branch_id, rule.contractor_id],
      );
      const next = this.computeNextScheduleDate(
        rule.frequency,
        last ? new Date(last.schedule_date) : null,
        today,
      );
      if (next && next <= until)
        candidates.push({
          ...rule,
          scheduleDate: next,
          auditorId: await this.assignAuditor(rule.client_id, rule.audit_type),
        });
    }
    return candidates;
  }
  async generateDueSchedules(scope: AutomationScope = {}) {
    let created = 0,
      skipped = 0,
      failures = 0;
    for (const rule of await this.candidates(scope)) {
      if (!rule.auditorId) {
        failures++;
        continue;
      }
      const result = await this.createSchedule({
        clientId: rule.client_id,
        auditType: rule.audit_type,
        auditorId: rule.auditorId,
        scheduleDate: rule.scheduleDate,
        dueDate: this.computeDefaultDueDate(rule.scheduleDate),
        branchId: rule.branch_id,
        contractorId: rule.contractor_id,
        scheduledBySystem: true,
        frequencyRuleId: rule.id,
        remarks: 'System auto-generated schedule',
      });
      if (result.success) created++;
      else skipped++;
    }
    return { created, skipped, failures };
  }

  async createSchedule(input: CreateScheduleInput) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [
          JSON.stringify([
            'audit-schedule',
            input.clientId,
            input.auditType,
            input.branchId || null,
            input.contractorId || null,
            new Date(input.scheduleDate).toISOString().slice(0, 10),
          ]),
        ],
      );
      return this.createScheduleWithin(input, manager);
    });
  }
  private async createScheduleWithin(
    input: CreateScheduleInput,
    manager: EntityManager,
  ) {
    const duplicate = await this.findDuplicateSchedule(
      {
        clientId: input.clientId,
        auditType: input.auditType,
        branchId: input.branchId ?? null,
        contractorId: input.contractorId ?? null,
        scheduleDate: input.scheduleDate,
      },
      manager,
    );

    if (duplicate) {
      return {
        success: false,
        message: 'Duplicate schedule already exists',
        schedule: duplicate,
      };
    }

    const slotHours =
      input.auditorSlotHours !== undefined && input.auditorSlotHours !== null
        ? input.auditorSlotHours
        : input.auditType === 'CONTRACTOR_AUDIT'
          ? await this.computeAuditorSlotHours(
              input.contractorId ?? null,
              input.branchId ?? null,
            )
          : null;

    const rows = await manager.query(
      `
      INSERT INTO audit_schedules
      (
        client_id,
        audit_type,
        branch_id,
        contractor_id,
        auditor_id,
        scheduled_by_crm_id,
        scheduled_by_system,
        schedule_date,
        due_date,
        frequency_rule_id,
        remarks,
        auditor_slot_hours,
        status,
        created_at,
        updated_at
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SCHEDULED', NOW(), NOW())
      RETURNING *
      `,
      [
        input.clientId,
        input.auditType,
        input.branchId ?? null,
        input.contractorId ?? null,
        input.auditorId,
        input.scheduledByCrmId ?? null,
        input.scheduledBySystem ?? false,
        input.scheduleDate,
        input.dueDate ?? null,
        input.frequencyRuleId ?? null,
        input.remarks ?? null,
        slotHours,
      ],
    );

    return {
      success: true,
      message: 'Audit schedule created successfully',
      schedule: rows[0],
    };
  }

  async createManualSchedule(input: {
    clientId: string;
    auditType: SupportedAuditType;
    auditorId: string;
    scheduleDate: Date;
    dueDate?: Date | null;
    branchId?: string | null;
    contractorId?: string | null;
    scheduledByCrmId: string;
    remarks?: string | null;
  }) {
    this.validateManualScheduleInput(input);

    return this.createSchedule({
      clientId: input.clientId,
      auditType: input.auditType,
      auditorId: input.auditorId,
      scheduleDate: input.scheduleDate,
      dueDate: input.dueDate ?? this.computeDefaultDueDate(input.scheduleDate),
      branchId: input.branchId ?? null,
      contractorId: input.contractorId ?? null,
      scheduledByCrmId: input.scheduledByCrmId,
      scheduledBySystem: false,
      remarks: input.remarks ?? 'Manually scheduled by CRM',
    });
  }

  async assignAuditor(
    clientId: string,
    _auditType?: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query(
      `
      SELECT ca.assigned_to_user_id AS auditor_id
      FROM client_assignments_current ca
      WHERE ca.client_id = $1
        AND ca.assignment_type='AUDITOR' AND ca.assigned_to_user_id IS NOT NULL
      ORDER BY ca.updated_at DESC
      LIMIT 1
      `,
      [clientId],
    );

    return rows[0]?.auditor_id ?? null;
  }

  async getAuditorSchedules(params: {
    auditorId: string;
    status?: string;
    clientId?: string;
    auditType?: string;
  }) {
    const where: string[] = [
      's.auditor_id = $1',
      'COALESCE(c.is_deleted, false) = false',
    ];
    const values: any[] = [params.auditorId];
    let idx = 2;

    if (params.status) {
      where.push(`s.status = $${idx}`);
      values.push(params.status);
      idx += 1;
    }

    if (params.clientId) {
      where.push(`s.client_id = $${idx}`);
      values.push(params.clientId);
      idx += 1;
    }

    if (params.auditType) {
      where.push(`s.audit_type = $${idx}`);
      values.push(params.auditType);
      idx += 1;
    }

    return this.dataSource.query(
      `
      SELECT
        s.*,
        c.client_name,
        b.branchname AS branch_name,
        b.branchtype AS branch_type
      FROM audit_schedules s
      LEFT JOIN clients c ON c.id = s.client_id
      LEFT JOIN client_branches b ON b.id = s.branch_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.schedule_date ASC, s.created_at DESC
      `,
      values,
    );
  }

  async findDuplicateSchedule(
    params: {
      clientId: string;
      auditType: string;
      branchId?: string | null;
      contractorId?: string | null;
      scheduleDate: Date;
    },
    manager: Pick<DataSource, 'query'> | EntityManager = this.dataSource,
  ) {
    const rows = await manager.query(
      `
      SELECT *
      FROM audit_schedules
      WHERE client_id = $1
        AND audit_type = $2
        AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000') =
            COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(contractor_id, '00000000-0000-0000-0000-000000000000') =
            COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND DATE(schedule_date) = DATE($5)
        AND status <> 'CANCELLED'
      LIMIT 1
      `,
      [
        params.clientId,
        params.auditType,
        params.branchId ?? null,
        params.contractorId ?? null,
        params.scheduleDate,
      ],
    );

    return rows[0] ?? null;
  }

  private validateManualScheduleInput(input: {
    auditType: SupportedAuditType;
    branchId?: string | null;
    contractorId?: string | null;
  }) {
    if (input.auditType === 'CONTRACTOR_AUDIT') {
      if (!input.branchId) {
        throw new Error('Branch is required for contractor audit');
      }
      if (!input.contractorId) {
        throw new Error('Contractor is required for contractor audit');
      }
    }

    if (
      input.auditType === 'FACTORY_AUDIT' ||
      input.auditType === 'BRANCH_COMPLIANCE_AUDIT' ||
      input.auditType === 'SAFETY_AUDIT' ||
      input.auditType === 'PAYROLL_AUDIT'
    ) {
      if (!input.branchId) {
        throw new Error('Branch is required for this audit type');
      }
    }
  }

  private computeNextScheduleDate(
    frequency: string,
    lastDate: Date | null,
    fallbackDate: Date,
  ): Date | null {
    if (
      ![
        'MONTHLY',
        'QUARTERLY',
        'HALF_YEARLY',
        'YEARLY',
        'ANNUAL',
        'WEEKLY',
      ].includes((frequency || '').toUpperCase())
    )
      return null;
    if (!lastDate) return new Date(fallbackDate);
    const base = new Date(lastDate);

    switch ((frequency ?? '').toUpperCase()) {
      case 'MONTHLY':
        return new Date(
          Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 5),
        );
      case 'QUARTERLY':
        return new Date(
          Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 3, 5),
        );
      case 'HALF_YEARLY':
        return new Date(
          Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 6, 5),
        );
      case 'YEARLY':
      case 'ANNUAL':
        return new Date(
          Date.UTC(base.getUTCFullYear() + 1, base.getUTCMonth(), 5),
        );
      case 'WEEKLY':
        return new Date(
          Date.UTC(
            base.getUTCFullYear(),
            base.getUTCMonth(),
            base.getUTCDate() + 7,
          ),
        );
      default:
        return null;
    }
  }

  private computeDefaultDueDate(scheduleDate: Date) {
    return new Date(
      Date.UTC(
        scheduleDate.getUTCFullYear(),
        scheduleDate.getUTCMonth(),
        scheduleDate.getUTCDate() + 3,
      ),
    );
  }

  /**
   * Item #9b: derive the auditor's allocated time (in hours) for a
   * contractor audit from the contractor's active employee headcount.
   *   < 50     => 1 hour
   *   50..100  => 2 hours
   *   > 100    => 3 hours
   * Returns null when there is no contractor scope (non-contractor audit).
   */
  async computeAuditorSlotHours(
    contractorId: string | null,
    branchId: string | null,
  ): Promise<number | null> {
    if (!contractorId) return null;
    try {
      const params: any[] = [contractorId];
      let branchFilter = '';
      if (branchId) {
        params.push(branchId);
        branchFilter = 'AND ce.branch_id = $2::uuid';
      }
      const rows = await this.dataSource.query(
        `SELECT COUNT(*)::int AS hc
           FROM contractor_employees ce
          WHERE ce.contractor_user_id = $1::uuid
            AND COALESCE(ce.status, 'ACTIVE') = 'ACTIVE'
            ${branchFilter}`,
        params,
      );
      const hc = Number(rows?.[0]?.hc ?? 0);
      if (hc < 50) return 1;
      if (hc <= 100) return 2;
      return 3;
    } catch (e: any) {
      this.logger.warn(
        `computeAuditorSlotHours failed (contractor=${contractorId}): ${e?.message || e}`,
      );
      return null;
    }
  }
}
