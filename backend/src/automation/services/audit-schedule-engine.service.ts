import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
}

@Injectable()
export class AuditScheduleEngineService {
  private readonly logger = new Logger(AuditScheduleEngineService.name);

  constructor(private readonly dataSource: DataSource) {}

  async generateDueSchedules() {
    const today = new Date();
    const fromDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const toDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 30,
    );

    const rules = await this.dataSource.query(
      `
      SELECT
        afr.id,
        afr.client_id,
        afr.audit_type,
        afr.frequency,
        afr.branch_id,
        afr.contractor_id,
        afr.is_active
      FROM audit_frequency_rules afr
      WHERE afr.is_active = true
      `,
    );

    let created = 0;
    let skipped = 0;

    for (const rule of rules) {
      const lastSchedule = await this.dataSource.query(
        `
        SELECT schedule_date
        FROM audit_schedules
        WHERE client_id = $1
          AND audit_type = $2
          AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000') =
              COALESCE($3, '00000000-0000-0000-0000-000000000000')
          AND COALESCE(contractor_id, '00000000-0000-0000-0000-000000000000') =
              COALESCE($4, '00000000-0000-0000-0000-000000000000')
        ORDER BY schedule_date DESC
        LIMIT 1
        `,
        [
          rule.client_id,
          rule.audit_type,
          rule.branch_id ?? null,
          rule.contractor_id ?? null,
        ],
      );

      const nextDate = this.computeNextScheduleDate(
        rule.frequency,
        lastSchedule[0]?.schedule_date
          ? new Date(lastSchedule[0].schedule_date)
          : null,
        fromDate,
      );

      if (!nextDate) {
        skipped += 1;
        continue;
      }

      if (nextDate > toDate) {
        skipped += 1;
        continue;
      }

      const auditorId = await this.assignAuditor(
        rule.client_id,
        rule.audit_type,
      );
      if (!auditorId) {
        this.logger.warn(
          `No auditor found for client ${rule.client_id} and type ${rule.audit_type}`,
        );
        skipped += 1;
        continue;
      }

      const alreadyExists = await this.findDuplicateSchedule({
        clientId: rule.client_id,
        auditType: rule.audit_type,
        branchId: rule.branch_id ?? null,
        contractorId: rule.contractor_id ?? null,
        scheduleDate: nextDate,
      });

      if (alreadyExists) {
        skipped += 1;
        continue;
      }

      await this.createSchedule({
        clientId: rule.client_id,
        auditType: rule.audit_type,
        auditorId,
        scheduleDate: nextDate,
        dueDate: this.computeDefaultDueDate(nextDate),
        branchId: rule.branch_id ?? null,
        contractorId: rule.contractor_id ?? null,
        scheduledBySystem: true,
        frequencyRuleId: rule.id,
        remarks: 'System auto-generated schedule',
      });

      created += 1;
    }

    return {
      generatedAt: new Date(),
      created,
      skipped,
    };
  }

  async createSchedule(input: CreateScheduleInput) {
    const duplicate = await this.findDuplicateSchedule({
      clientId: input.clientId,
      auditType: input.auditType,
      branchId: input.branchId ?? null,
      contractorId: input.contractorId ?? null,
      scheduleDate: input.scheduleDate,
    });

    if (duplicate) {
      return {
        success: false,
        message: 'Duplicate schedule already exists',
        schedule: duplicate,
      };
    }

    const rows = await this.dataSource.query(
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
        status,
        created_at,
        updated_at
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SCHEDULED', NOW(), NOW())
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
      SELECT ca.auditor_user_id AS auditor_id
      FROM client_assignments_current ca
      WHERE ca.client_id = $1
        AND ca.auditor_user_id IS NOT NULL
      ORDER BY ca.created_at DESC
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
    const where: string[] = ['s.auditor_id = $1'];
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

  async findDuplicateSchedule(params: {
    clientId: string;
    auditType: string;
    branchId?: string | null;
    contractorId?: string | null;
    scheduleDate: Date;
  }) {
    const rows = await this.dataSource.query(
      `
      SELECT *
      FROM audit_schedules
      WHERE client_id = $1
        AND audit_type = $2
        AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000') =
            COALESCE($3, '00000000-0000-0000-0000-000000000000')
        AND COALESCE(contractor_id, '00000000-0000-0000-0000-000000000000') =
            COALESCE($4, '00000000-0000-0000-0000-000000000000')
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
    const base = lastDate ? new Date(lastDate) : new Date(fallbackDate);

    switch ((frequency ?? '').toUpperCase()) {
      case 'MONTHLY':
        return new Date(base.getFullYear(), base.getMonth() + 1, 5);
      case 'QUARTERLY':
        return new Date(base.getFullYear(), base.getMonth() + 3, 5);
      case 'HALF_YEARLY':
        return new Date(base.getFullYear(), base.getMonth() + 6, 5);
      case 'YEARLY':
      case 'ANNUAL':
        return new Date(base.getFullYear() + 1, base.getMonth(), 5);
      case 'WEEKLY':
        return new Date(
          base.getFullYear(),
          base.getMonth(),
          base.getDate() + 7,
        );
      default:
        return null;
    }
  }

  private computeDefaultDueDate(scheduleDate: Date) {
    return new Date(
      scheduleDate.getFullYear(),
      scheduleDate.getMonth(),
      scheduleDate.getDate() + 3,
      23,
      59,
      59,
    );
  }
}
