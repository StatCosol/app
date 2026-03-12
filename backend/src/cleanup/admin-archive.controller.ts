import {
  Controller,
  Get,
  Param,
  Post,
  ParseUUIDPipe,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientsService } from '../clients/clients.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/archive', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminArchiveController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clientsService: ClientsService,
  ) {}

  /** List all soft-deleted clients (available for 3 years) */
  @ApiOperation({ summary: 'List Deleted Clients' })
  @Get('clients')
  async listDeletedClients() {
    const rows = await this.dataSource.query(`
      SELECT
        c.id,
        c.client_code   AS "clientCode",
        c.client_name   AS "clientName",
        c.status,
        c.deleted_at    AS "deletedAt",
        c.delete_reason AS "deleteReason",
        du.name         AS "deletedByName",
        (SELECT COUNT(*)::int FROM client_branches cb WHERE cb.clientid = c.id) AS "branchCount"
      FROM clients c
      LEFT JOIN users du ON du.id = c.deleted_by
      WHERE c.is_deleted = true
      ORDER BY c.deleted_at DESC
    `);
    return rows;
  }

  /** List soft-deleted branches (not tied to a specific client) */
  @ApiOperation({ summary: 'List Deleted Branches' })
  @Get('branches')
  async listDeletedBranches() {
    const rows = await this.dataSource.query(`
      SELECT
        cb.id,
        cb.branchname     AS "branchName",
        cb.branchtype     AS "branchType",
        cb.status,
        cb.deletedat      AS "deletedAt",
        cb.deletereason   AS "deleteReason",
        c.client_name     AS "clientName",
        c.client_code     AS "clientCode",
        c.id              AS "clientId"
      FROM client_branches cb
      LEFT JOIN clients c ON c.id = cb.clientid
      WHERE cb.isdeleted = true
      ORDER BY cb.deletedat DESC
    `);
    return rows;
  }

  /** List soft-deleted users */
  @ApiOperation({ summary: 'List Deleted Users' })
  @Get('users')
  async listDeletedUsers() {
    const rows = await this.dataSource.query(`
      SELECT
        u.id,
        u.name,
        REGEXP_REPLACE(u.email, '#deleted#\\d*', '', 'g') AS email,
        r.code          AS "roleCode",
        r.name          AS "roleName",
        u.deleted_at    AS "deletedAt",
        u.client_id     AS "clientId",
        c.client_name   AS "clientName"
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN clients c ON c.id = u.client_id
      WHERE u.deleted_at IS NOT NULL
      ORDER BY u.deleted_at DESC
    `);
    return rows;
  }

  /** Get archived data summary for a specific deleted client */
  @ApiOperation({ summary: 'Get Deleted Client Summary' })
  @Get('clients/:id/summary')
  async getDeletedClientSummary(@Param('id', ParseUUIDPipe) id: string) {
    const [client] = await this.dataSource.query(
      `SELECT id, client_code AS "clientCode", client_name AS "clientName",
              deleted_at AS "deletedAt", delete_reason AS "deleteReason"
       FROM clients WHERE id = $1`,
      [id],
    );
    if (!client) return { error: 'Client not found' };

    const counts = await this.dataSource.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM client_branches WHERE clientid = $1) AS branches,
        (SELECT COUNT(*)::int FROM compliance_tasks WHERE client_id = $1) AS "complianceTasks",
        (SELECT COUNT(*)::int FROM audits WHERE client_id = $1) AS audits,
        (SELECT COUNT(*)::int FROM compliance_returns WHERE client_id = $1) AS returns,
        (SELECT COUNT(*)::int FROM compliance_doc_library WHERE client_id = $1) AS documents,
        (SELECT COUNT(*)::int FROM safety_documents WHERE client_id = $1) AS "safetyDocs",
        (SELECT COUNT(*)::int FROM branch_documents WHERE client_id = $1) AS "branchDocs",
        (SELECT COUNT(*)::int FROM registers_records WHERE client_id = $1) AS registers
    `,
      [id],
    );

    return { client, counts: counts[0] };
  }

  /** List documents for a deleted client */
  @ApiOperation({ summary: 'Get Deleted Client Documents' })
  @Get('clients/:id/documents')
  async getDeletedClientDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: string,
  ) {
    // compliance_doc_library
    if (!type || type === 'compliance') {
      const rows = await this.dataSource.query(
        `
        SELECT
          d.id, d.file_name AS "fileName", d.category, d.title,
          d.created_at AS "uploadedAt",
          cb.branchname AS "branchName"
        FROM compliance_doc_library d
        LEFT JOIN client_branches cb ON cb.id = d.branch_id
        WHERE d.client_id = $1
        ORDER BY d.created_at DESC
        LIMIT 500
      `,
        [id],
      );
      return rows;
    }
    if (type === 'safety') {
      const rows = await this.dataSource.query(
        `
        SELECT
          d.id, d.file_name AS "fileName", d.document_type AS "docType",
          d.created_at AS "uploadedAt", d.valid_from AS "validFrom", d.valid_to AS "validTo",
          cb.branchname AS "branchName"
        FROM safety_documents d
        LEFT JOIN client_branches cb ON cb.id = d.branch_id
        WHERE d.client_id = $1
        ORDER BY d.created_at DESC
        LIMIT 500
      `,
        [id],
      );
      return rows;
    }
    if (type === 'branch') {
      const rows = await this.dataSource.query(
        `
        SELECT
          d.id, d.file_name AS "fileName", d.doc_type AS "docType",
          d.created_at AS "createdAt",
          cb.branchname AS "branchName"
        FROM branch_documents d
        LEFT JOIN client_branches cb ON cb.id = d.branch_id
        WHERE d.client_id = $1
        ORDER BY d.created_at DESC
        LIMIT 500
      `,
        [id],
      );
      return rows;
    }
    return [];
  }

  /** List audits for a deleted client */
  @ApiOperation({ summary: 'Get Deleted Client Audits' })
  @Get('clients/:id/audits')
  async getDeletedClientAudits(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.dataSource.query(
      `
      SELECT
        a.id, a.audit_code AS "auditCode", a.audit_type AS "auditType",
        a.status, a.score, a.due_date AS "scheduledDate",
        cb.branchname AS "branchName",
        auditor.name AS "auditorName",
        (SELECT COUNT(*)::int FROM audit_observations o WHERE o.audit_id = a.id) AS "observationCount"
      FROM audits a
      LEFT JOIN client_branches cb ON cb.id = a.branch_id
      LEFT JOIN users auditor ON auditor.id = a.assigned_auditor_id
      WHERE a.client_id = $1
      ORDER BY a.due_date DESC
    `,
      [id],
    );
    return rows;
  }

  /** List returns/filings for a deleted client */
  @ApiOperation({ summary: 'Get Deleted Client Returns' })
  @Get('clients/:id/returns')
  async getDeletedClientReturns(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.dataSource.query(
      `
      SELECT
        r.id, r.return_type AS "returnName", r.period_label AS "period", r.status,
        r.due_date AS "dueDate", r.filed_date AS "filedDate",
        r.ack_number AS "ackNumber",
        cb.branchname AS "branchName"
      FROM compliance_returns r
      LEFT JOIN client_branches cb ON cb.id = r.branch_id
      WHERE r.client_id = $1
      ORDER BY r.due_date DESC
    `,
      [id],
    );
    return rows;
  }

  /** List registers for a deleted client */
  @ApiOperation({ summary: 'Get Deleted Client Registers' })
  @Get('clients/:id/registers')
  async getDeletedClientRegisters(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.dataSource.query(
      `
      SELECT
        rr.id, rr.title AS "registerName",
        CONCAT(rr.period_year, '-', LPAD(rr.period_month::text, 2, '0')) AS "period",
        rr.file_path AS "fileUrl", rr.created_at AS "createdAt",
        cb.branchname AS "branchName"
      FROM registers_records rr
      LEFT JOIN client_branches cb ON cb.id = rr.branch_id
      WHERE rr.client_id = $1
      ORDER BY rr.created_at DESC
    `,
      [id],
    );
    return rows;
  }

  /** Restore a soft-deleted client */
  @ApiOperation({ summary: 'Restore Client' })
  @Post('clients/:id/restore')
  async restoreClient(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.clientsService.restore(
      id,
      req.user?.userId,
      req.user?.roleCode,
    );
  }
}
