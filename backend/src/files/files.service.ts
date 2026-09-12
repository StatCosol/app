import {
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import * as path from 'path';
import { PayrollInputFileEntity } from '../payroll/entities/payroll-input-file.entity';
import { RegistersRecordEntity } from '../payroll/entities/registers-record.entity';
import { HelpdeskMessageFileEntity } from '../helpdesk/entities/helpdesk-message-file.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(PayrollInputFileEntity)
    private pifRepo: Repository<PayrollInputFileEntity>,
    @InjectRepository(RegistersRecordEntity)
    private rrRepo: Repository<RegistersRecordEntity>,
    @InjectRepository(HelpdeskMessageFileEntity)
    private hmfRepo: Repository<HelpdeskMessageFileEntity>,
    @InjectRepository(ContractorDocumentEntity)
    private cdRepo: Repository<ContractorDocumentEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private assignRepo: Repository<PayrollClientAssignmentEntity>,
    private readonly scope: AccessScopeService,
  ) {}

  // Determine if user can access a filePath (by checking known tables)
  async assertCanDownload(user: ReqUser, filePath: string) {
    const filePathVariants = this.filePathVariants(filePath);

    // Match the billing PDF controller's role policy. Billing tenant_id is not
    // a platform client_id, so it must never be treated as client ownership.
    if (/^(?:\/?uploads\/)?invoices\//.test(filePath)) {
      if (!['ADMIN', 'ACCOUNTS'].includes(user.roleCode))
        throw new ForbiddenException();
      const rows = await this.cdRepo.manager.query(
        'SELECT id FROM invoices WHERE pdf_path = ANY($1::text[]) LIMIT 1',
        [filePathVariants],
      );
      if (!rows[0]) throw new BadRequestException('File not registered in DB');
      return;
    }

    // 1) contractor_documents
    const cd = await this.cdRepo.findOne({
      where: filePathVariants.map((p) => ({ filePath: p })),
    });
    if (cd) {
      if (user.roleCode === 'CONTRACTOR') {
        if (user.id !== cd.contractorUserId) throw new ForbiddenException();
        return;
      }
      await this.assertOwnerInScope(user, {
        clientId: cd.clientId,
        branchId: cd.branchId ?? null,
        employeeId: null,
      });
      return;
    }

    // 2) payroll_input_files — verify user belongs to the same client via payroll_inputs
    const pif = await this.pifRepo.findOne({
      where: filePathVariants.map((p) => ({ filePath: p })),
    });
    if (pif) {
      if (user.roleCode === 'ADMIN') return;
      // Resolve the owning clientId through the parent payroll_input record
      const [piRow] = await this.pifRepo.manager.query(
        `SELECT pi.client_id FROM payroll_inputs pi
         JOIN payroll_input_files pif ON pif.payroll_input_id = pi.id
         WHERE pif.id = $1`,
        [pif.id],
      );
      const ownerClientId = piRow?.client_id;
      if (user.roleCode === 'CLIENT') {
        if (user.clientId !== ownerClientId) throw new ForbiddenException();
        return;
      }
      if (user.roleCode === 'PAYROLL') {
        const assignment = await this.assignRepo.findOne({
          where: {
            payrollUserId: user.id,
            clientId: ownerClientId,
            status: 'ACTIVE',
            endDate: IsNull(),
          },
        });
        if (!assignment) throw new ForbiddenException();
        return;
      }
      throw new ForbiddenException();
    }

    // 3) registers_records
    const rr = await this.rrRepo.findOne({
      where: filePathVariants.map((p) => ({ filePath: p })),
    });
    if (rr) {
      if (user.roleCode === 'CLIENT') {
        if (user.clientId !== rr.clientId) throw new ForbiddenException();
        return;
      }
      if (user.roleCode === 'PAYROLL') {
        const ok = await this.assignRepo.findOne({
          where: {
            payrollUserId: user.id,
            clientId: rr.clientId,
            status: 'ACTIVE',
            endDate: IsNull(),
          },
        });
        if (!ok) throw new ForbiddenException();
        return;
      }
      await this.assertOwnerInScope(user, {
        clientId: rr.clientId,
        branchId: rr.branchId ?? null,
        employeeId: null,
      });
      return;
    }

    // 4) helpdesk_message_files — join back to the ticket so we enforce
    // the same role-based scope as the ticket detail/messages endpoints.
    const hmf = await this.hmfRepo.findOne({
      where: filePathVariants.map((p) => ({ filePath: p })),
    });
    if (hmf) {
      const rows: Array<{
        clientId: string;
        category: string;
        assignedToUserId: string | null;
        createdByUserId: string;
      }> = await this.hmfRepo.manager.query(
        `SELECT t.client_id            AS "clientId",
                t.category             AS "category",
                t.assigned_to_user_id  AS "assignedToUserId",
                t.created_by_user_id   AS "createdByUserId"
           FROM helpdesk_message_files hmf
           JOIN helpdesk_messages hm ON hm.id = hmf.message_id
           JOIN helpdesk_tickets  t  ON t.id  = hm.ticket_id
          WHERE hmf.id = $1
          LIMIT 1`,
        [hmf.id],
      );
      const ticket = rows[0];
      if (!ticket) throw new ForbiddenException();

      if (user.roleCode === 'ADMIN') return;
      if (user.roleCode === 'CLIENT') {
        if (user.clientId && user.clientId === ticket.clientId) return;
        throw new ForbiddenException();
      }
      if (user.roleCode === 'PF_TEAM') {
        // PF Team: PF/ESI/PAYSLIP categories only, and respect assignment
        if (!['PF', 'ESI', 'PAYSLIP'].includes(ticket.category)) {
          throw new ForbiddenException();
        }
        if (ticket.assignedToUserId !== user.id) {
          throw new ForbiddenException();
        }
        return;
      }
      if (user.roleCode === 'EMPLOYEE') {
        if (ticket.createdByUserId === user.id) return;
        throw new ForbiddenException();
      }
      throw new ForbiddenException();
    }

    // 5) Everything else that is registered against an owning row.
    //
    // The four checks above are bespoke because their ownership is indirect —
    // a helpdesk file belongs to a ticket, a payroll input file to a payroll
    // input. The rest of the document tables all carry the owner on the row
    // itself, so one rule serves them and adding a document type is one entry
    // in SCOPED_DOCUMENT_TABLES rather than another branch here.
    const owner = await this.findScopedOwner(filePathVariants);
    if (owner) {
      await this.assertOwnerInScope(user, owner);
      return;
    }

    throw new BadRequestException('File not registered in DB');
  }

  /**
   * Tables whose rows carry their own owner and a path to the stored file.
   *
   * Files without an owning row cannot be downloaded. Scratch imports are
   * deliberately not served by the static uploads middleware.
   */
  private static readonly SCOPED_DOCUMENT_TABLES: ReadonlyArray<{
    table: string;
    /** Column holding the stored path — not uniform across these tables. */
    pathColumn: string;
    clientColumn: string;
    branchColumn?: string;
    employeeColumn?: string;
  }> = [
    {
      table: 'employee_generated_forms',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
      employeeColumn: 'employee_id',
    },
    {
      table: 'compliance_returns',
      pathColumn: 'ack_file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'compliance_returns',
      pathColumn: 'challan_file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'branch_registrations',
      pathColumn: 'document_url',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'branch_registrations',
      pathColumn: 'renewal_document_url',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    // Branch compliance evidence: the largest sensitive category, and the one
    // that names its path column differently from every other table.
    {
      table: 'compliance_documents',
      pathColumn: 'uploaded_file_url',
      clientColumn: 'company_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'compliance_doc_library',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'branch_documents',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'monthly_compliance_uploads',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'crm_unit_documents',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'safety_documents',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'payroll_payslip_archives',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      branchColumn: 'branch_id',
    },
    {
      table: 'employee_documents',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      employeeColumn: 'employee_id',
    },
    {
      table: 'payroll_fnf_documents',
      pathColumn: 'file_path',
      clientColumn: 'client_id',
      employeeColumn: 'employee_id',
    },
  ];

  private async findScopedOwner(filePathVariants: string[]): Promise<{
    clientId: string | null;
    branchId: string | null;
    employeeId: string | null;
  } | null> {
    try {
      const notices = await this.cdRepo.manager.query(
        `SELECT n.client_id AS "clientId", n.branch_id AS "branchId", NULL::uuid AS "employeeId"
           FROM notice_documents d JOIN notices n ON n.id = d.notice_id
          WHERE d.file_url = ANY($1::text[]) LIMIT 1`,
        [filePathVariants],
      );
      if (notices[0]) return notices[0];
    } catch (err) {
      // A deployment without the notices module cannot authorize its files,
      // but may still serve other registered document types.
      if (!['42P01', '42703'].includes((err as { code?: string }).code ?? ''))
        throw err;
    }
    for (const spec of FilesService.SCOPED_DOCUMENT_TABLES) {
      const branchSelect = spec.branchColumn
        ? `${spec.branchColumn} AS "branchId"`
        : `NULL::uuid AS "branchId"`;
      const employeeSelect = spec.employeeColumn
        ? `${spec.employeeColumn} AS "employeeId"`
        : `NULL::uuid AS "employeeId"`;
      let rows: Array<{
        clientId: string | null;
        branchId: string | null;
        employeeId: string | null;
      }> = [];
      try {
        rows = await this.cdRepo.manager.query(
          `SELECT ${spec.clientColumn} AS "clientId", ${branchSelect}, ${employeeSelect}
             FROM ${spec.table}
            WHERE ${spec.pathColumn} = ANY($1::text[])
            LIMIT 1`,
          [filePathVariants],
        );
      } catch {
        // A table this build does not have yet must not make every download
        // fail; it simply cannot authorize anything.
        continue;
      }
      if (rows[0]) return rows[0];
    }
    return null;
  }

  private async assertOwnerInScope(
    user: ReqUser,
    owner: {
      clientId: string | null;
      branchId: string | null;
      employeeId: string | null;
    },
  ): Promise<void> {
    // An employee sees their own documents and nobody else's, whatever client
    // scope would otherwise allow.
    if (user.roleCode === 'EMPLOYEE') {
      if (
        owner.employeeId &&
        user.employeeId &&
        owner.employeeId === user.employeeId
      ) {
        return;
      }
      throw new ForbiddenException();
    }

    if (!owner.clientId) throw new ForbiddenException();

    // Client, assigned-clients and branch scoping all live in one place
    // already; reimplementing them here is how the two would drift apart.
    await this.scope.assertClientAllowed(user, owner.clientId);

    const scope = await this.scope.getScope(user);
    if (scope.level === 'branches' && owner.branchId) {
      if (!(scope.branchIds ?? []).includes(owner.branchId)) {
        throw new ForbiddenException('Branch not in scope');
      }
    }
  }

  private filePathVariants(filePath: string): string[] {
    const normalized = String(filePath || '')
      .replace(/\\/g, '/')
      .replace(/^\/?uploads\//i, '')
      .replace(/^\/+/, '');
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    return Array.from(
      new Set([
        normalized,
        path.join(uploadsRoot, normalized),
        path.join(uploadsRoot, normalized).replace(/\\/g, '/'),
        `uploads/${normalized}`,
        `/uploads/${normalized}`,
      ]),
    ).filter(Boolean);
  }
}
