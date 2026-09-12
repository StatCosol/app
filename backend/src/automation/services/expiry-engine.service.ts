import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService } from './task-engine.service';
import { AutomationNotificationService } from './automation-notification.service';
import { RenewalFilingEngineService } from './renewal-filing-engine.service';
import { operationalDate } from '../../common/operational-date';

/** Canonical expiry scan used by scheduled and manual triggers. */
@Injectable()
export class ExpiryEngineService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly taskEngine: TaskEngineService,
    private readonly notifications: AutomationNotificationService,
    private readonly renewals: RenewalFilingEngineService,
  ) {}

  async generateExpiryAlerts() {
    const renewal = await this.renewals.generateRenewalFilings();
    const docs = await this.dataSource.query(
      `SELECT cd.id,cd.title,cd.expiry_date::text AS expiry_date,
      cd.contractor_user_id,cd.client_id,cd.branch_id FROM contractor_documents cd
      JOIN clients c ON c.id=cd.client_id
      JOIN client_branches b ON b.id=cd.branch_id AND b.clientid=cd.client_id
      JOIN users u ON u.id=cd.contractor_user_id
      WHERE cd.expiry_date BETWEEN $1::date AND $1::date + 30
        AND cd.status NOT IN ('EXPIRED','CANCELLED') AND c.is_deleted=false
        AND b.isactive=true AND u.is_active=true AND u.deleted_at IS NULL`,
      [operationalDate()],
    );
    let tasksCreated = renewal.tasksCreated,
      alertsSent = 0;
    for (const doc of docs) {
      const created = await this.dataSource.transaction(
        'READ COMMITTED',
        async (manager) => {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [JSON.stringify(['document-expiry', doc.id])],
          );
          // Adopt the old alias, retaining task ID and history. Only exact document owner/scope matches qualify.
          await manager.query(
            `UPDATE system_tasks SET reference_type='CONTRACTOR_DOC_EXPIRY',
          contractor_id=$2, branch_id=$4, updated_at=now(),
          description=CASE WHEN reference_type='LICENSE_EXPIRY' THEN COALESCE(description,'') || E'\nLegacy LICENSE_EXPIRY activity adopted by the document expiry workflow.' ELSE description END
          WHERE reference_type IN ('LICENSE_EXPIRY','CONTRACTOR_DOC_EXPIRY') AND reference_id=$1
            AND client_id=$3 AND (branch_id=$4 OR branch_id IS NULL)
            AND assigned_role='CONTRACTOR' AND assigned_user_id=$2
            AND (contractor_id=$2 OR contractor_id IS NULL) AND due_date=$5::date`,
            [
              doc.id,
              doc.contractor_user_id,
              doc.client_id,
              doc.branch_id,
              doc.expiry_date,
            ],
          );
          await manager.query(
            `WITH ranked AS (
          SELECT id, first_value(id) OVER (ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 0 WHEN 'REUPLOADED' THEN 1 ELSE 2 END,created_at,id) AS kept,
            row_number() OVER (ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 0 WHEN 'REUPLOADED' THEN 1 ELSE 2 END,created_at,id) AS rn
          FROM system_tasks WHERE reference_type='CONTRACTOR_DOC_EXPIRY' AND reference_id=$1
            AND client_id=$3 AND branch_id=$4 AND contractor_id=$2
            AND assigned_role='CONTRACTOR' AND assigned_user_id=$2
            AND status NOT IN ('CLOSED','CANCELLED') AND due_date=$5::date)
          UPDATE system_tasks t SET status='CANCELLED', updated_at=now(),
            description=COALESCE(t.description,'') || E'\nDuplicate expiry activity; retained task ' || ranked.kept::text
          FROM ranked WHERE t.id=ranked.id AND ranked.rn>1`,
            [
              doc.id,
              doc.contractor_user_id,
              doc.client_id,
              doc.branch_id,
              doc.expiry_date,
            ],
          );
          const existing = await manager.query(
            `SELECT id FROM system_tasks WHERE reference_type='CONTRACTOR_DOC_EXPIRY'
          AND reference_id=$1 AND assigned_user_id=$2 AND client_id=$3 AND branch_id=$4 AND due_date=$5::date`,
            [
              doc.id,
              doc.contractor_user_id,
              doc.client_id,
              doc.branch_id,
              doc.expiry_date,
            ],
          );
          await this.taskEngine.createTask(
            {
              module: 'RENEWAL',
              title: `Renew: ${doc.title || 'Document'}`,
              description: `Document "${doc.title}" expires ${doc.expiry_date}.`,
              referenceId: doc.id,
              referenceType: 'CONTRACTOR_DOC_EXPIRY',
              priority: 'HIGH',
              assignedRole: 'CONTRACTOR',
              assignedUserId: doc.contractor_user_id,
              contractorId: doc.contractor_user_id,
              clientId: doc.client_id,
              branchId: doc.branch_id,
              dueDate: new Date(doc.expiry_date),
              reuseTerminal: true,
              occurrenceDate: doc.expiry_date,
            },
            manager,
          );
          return !existing.length;
        },
      );
      if (created) tasksCreated++;
      if (
        await this.notifications.sendExpiryAlert({
          documentId: doc.id,
          userId: doc.contractor_user_id,
          role: 'CONTRACTOR',
          documentName: doc.title || 'Document',
          expiryDate: doc.expiry_date,
          clientId: doc.client_id,
          branchId: doc.branch_id,
        })
      )
        alertsSent++;
    }
    return {
      expiringItems: docs.length + renewal.filingsCreated + renewal.skipped,
      tasksCreated,
      alertsSent,
    };
  }
}
