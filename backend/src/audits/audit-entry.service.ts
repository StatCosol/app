import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { ReqUser } from '../access/access-scope.service';
import { AuditType } from '../common/enums';
import { StartAuditEntryDto } from './dto/start-audit-entry.dto';

// A branch assignment grants that branch only. A current client assignment
// grants the client's active branches. Historical assignments grant nothing.
export const AUDIT_ENTRY_BRANCHES_SQL = `
SELECT b.id, b.clientid AS "clientId", b.branchname AS "name", c.client_name AS "clientName"
FROM client_branches b JOIN clients c ON c.id=b.clientid
WHERE b.isactive=TRUE AND COALESCE(b.isdeleted,FALSE)=FALSE
  AND c.status='ACTIVE' AND COALESCE(c.is_deleted,FALSE)=FALSE
  AND (EXISTS (SELECT 1 FROM client_assignments_current ca
    WHERE ca.client_id=c.id AND ca.assignment_type='AUDITOR' AND ca.assigned_to_user_id=$1)
    OR EXISTS (SELECT 1 FROM branch_auditor_assignments ba
      WHERE ba.client_id=c.id AND ba.branch_id=b.id AND ba.auditor_user_id=$1
        AND ba.is_active=TRUE AND ba.start_date<=NOW() AND (ba.end_date IS NULL OR ba.end_date>NOW())))
ORDER BY c.client_name,b.branchname`;

@Injectable()
export class AuditEntryService {
  constructor(private readonly db: DataSource) {}

  private actor(user: ReqUser): string {
    const id = user?.userId || user?.id;
    if (user?.roleCode !== 'AUDITOR' || !id)
      throw new ForbiddenException('Auditor access only');
    return id;
  }

  async options(user: ReqUser) {
    const branches = await this.db.query(AUDIT_ENTRY_BRANCHES_SQL, [
      this.actor(user),
    ]);
    const contractors = branches.length
      ? await this.db.query(
          `
      SELECT DISTINCT u.id, u.name, bc.client_id AS "clientId", bc.branch_id AS "branchId"
      FROM branch_contractor bc JOIN users u ON u.id=bc.contractor_user_id
      JOIN roles r ON r.id=u.role_id
      WHERE bc.branch_id=ANY($1::uuid[]) AND r.code='CONTRACTOR'
        AND u.is_active=TRUE AND u.deleted_at IS NULL
      ORDER BY u.name`,
          [branches.map((branch) => branch.id)],
        )
      : [];
    const clients = [
      ...new Map(
        branches.map((branch) => [
          branch.clientId,
          { id: branch.clientId, name: branch.clientName },
        ]),
      ).values(),
    ];
    return {
      clients,
      branches,
      contractors,
      auditTypes: Object.values(AuditType),
    };
  }

  async start(user: ReqUser, dto: StartAuditEntryDto) {
    const auditorId = this.actor(user);
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(dto.periodCode) ||
      !Object.values(AuditType).includes(dto.auditType)
    )
      throw new BadRequestException(
        'Select a valid audit type and period (YYYY-MM)',
      );
    if (dto.auditType === AuditType.CONTRACTOR && !dto.contractorUserId)
      throw new BadRequestException(
        'Select a contractor for a contractor audit',
      );
    if (dto.auditType !== AuditType.CONTRACTOR && dto.contractorUserId)
      throw new BadRequestException(
        'Contractor selection is only available for contractor audits',
      );

    return this.db.transaction(async (manager) => {
      // Recheck scope on submission; never trust options previously sent to a browser.
      const branches = await manager.query(AUDIT_ENTRY_BRANCHES_SQL, [
        auditorId,
      ]);
      if (
        !branches.some(
          (branch) =>
            branch.id === dto.branchId && branch.clientId === dto.clientId,
        )
      )
        throw new ForbiddenException(
          'This client and branch are not assigned to you',
        );
      if (dto.contractorUserId) {
        const linked = await manager.query(
          `SELECT u.id FROM branch_contractor bc
          JOIN users u ON u.id=bc.contractor_user_id JOIN roles r ON r.id=u.role_id
          WHERE bc.client_id=$1 AND bc.branch_id=$2 AND bc.contractor_user_id=$3
            AND r.code='CONTRACTOR' AND u.is_active=TRUE AND u.deleted_at IS NULL`,
          [dto.clientId, dto.branchId, dto.contractorUserId],
        );
        if (!linked.length)
          throw new ForbiddenException(
            'Contractor is not linked to the selected branch',
          );
      }
      const key = [
        auditorId,
        dto.clientId,
        dto.branchId,
        dto.auditType,
        dto.periodCode,
        dto.contractorUserId || '',
      ].join(':');
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [key],
      );
      const existing = await manager.query(
        `SELECT id, audit_code AS "auditCode", status FROM audits
        WHERE assigned_auditor_id=$1 AND client_id=$2 AND branch_id=$3
          AND audit_type=$4 AND period_code=$5 AND contractor_user_id IS NOT DISTINCT FROM $6::uuid
          AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1`,
        [
          auditorId,
          dto.clientId,
          dto.branchId,
          dto.auditType,
          dto.periodCode,
          dto.contractorUserId || null,
        ],
      );
      if (existing.length)
        return {
          auditId: existing[0].id,
          auditCode: existing[0].auditCode,
          created: false,
        };
      const id = randomUUID();
      const year = Number(dto.periodCode.slice(0, 4));
      // Separate prefix avoids interfering with the CRM's sequential AUD codes.
      const code = `AX-${year}-${id.replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      await manager.query(
        `INSERT INTO audits
        (id,audit_code,client_id,branch_id,contractor_user_id,frequency,audit_type,period_year,period_code,
         assigned_auditor_id,created_by_user_id,status,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,'MONTHLY',$6,$7,$8,$9,$9,'IN_PROGRESS',NOW(),NOW())`,
        [
          id,
          code,
          dto.clientId,
          dto.branchId,
          dto.contractorUserId || null,
          dto.auditType,
          year,
          dto.periodCode,
          auditorId,
        ],
      );
      return { auditId: id, auditCode: code, created: true };
    });
  }
}
