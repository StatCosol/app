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

    // 4) helpdesk_message_files (optional)
    const hmf = await this.hmfRepo.findOne({ where: { filePath } });
    if (hmf) {
      // simplest: allow PF_TEAM/CLIENT/ADMIN; for strict, join via ticket->clientId
      if (['PF_TEAM', 'CLIENT', 'ADMIN'].includes(user.roleCode)) return;
      throw new ForbiddenException();
    }

    throw new BadRequestException('File not registered in DB');
  }
}
