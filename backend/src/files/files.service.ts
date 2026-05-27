import {
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { PayrollInputFileEntity } from '../payroll/entities/payroll-input-file.entity';
import { RegistersRecordEntity } from '../payroll/entities/registers-record.entity';
import { HelpdeskMessageFileEntity } from '../helpdesk/entities/helpdesk-message-file.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';
import { ReqUser } from '../access/access-scope.service';

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
  ) {}

  // Determine if user can access a filePath (by checking known tables)
  async assertCanDownload(user: ReqUser, filePath: string) {
    // 1) contractor_documents
    const cd = await this.cdRepo.findOne({ where: { filePath } });
    if (cd) {
      if (user.roleCode === 'CONTRACTOR' && user.id !== cd.contractorUserId)
        throw new ForbiddenException();
      if (user.roleCode === 'CLIENT' && user.clientId !== cd.clientId)
        throw new ForbiddenException();
      return;
    }

    // 2) payroll_input_files — verify user belongs to the same client via payroll_inputs
    const pif = await this.pifRepo.findOne({ where: { filePath } });
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
    const rr = await this.rrRepo.findOne({ where: { filePath } });
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
      return; // ADMIN/others
    }

    // 4) helpdesk_message_files — join back to the ticket so we enforce
    // the same role-based scope as the ticket detail/messages endpoints.
    const hmf = await this.hmfRepo.findOne({ where: { filePath } });
    if (hmf) {
      const rows: Array<{
        clientId: string;
        category: string;
        assignedToUserId: string | null;
      }> = await this.hmfRepo.manager.query(
        `SELECT t.client_id            AS "clientId",
                t.category             AS "category",
                t.assigned_to_user_id  AS "assignedToUserId"
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
        if (ticket.assignedToUserId && ticket.assignedToUserId !== user.id) {
          throw new ForbiddenException();
        }
        return;
      }
      throw new ForbiddenException();
    }

    throw new BadRequestException('File not registered in DB');
  }
}
