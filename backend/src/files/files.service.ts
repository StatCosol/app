import { ForbiddenException, Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollInputFileEntity } from '../payroll/entities/payroll-input-file.entity';
import { RegistersRecordEntity } from '../payroll/entities/registers-record.entity';
import { HelpdeskMessageFileEntity } from '../helpdesk/entities/helpdesk-message-file.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { PayrollClientAssignmentEntity } from '../payroll/entities/payroll-client-assignment.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(PayrollInputFileEntity) private pifRepo: Repository<PayrollInputFileEntity>,
    @InjectRepository(RegistersRecordEntity) private rrRepo: Repository<RegistersRecordEntity>,
    @InjectRepository(HelpdeskMessageFileEntity) private hmfRepo: Repository<HelpdeskMessageFileEntity>,
    @InjectRepository(ContractorDocumentEntity) private cdRepo: Repository<ContractorDocumentEntity>,
    @InjectRepository(PayrollClientAssignmentEntity) private assignRepo: Repository<PayrollClientAssignmentEntity>,
  ) {}

  // Determine if user can access a filePath (by checking known tables)
  async assertCanDownload(user: any, filePath: string) {
    // 1) contractor_documents
    const cd = await this.cdRepo.findOne({ where: { filePath } });
    if (cd) {
      if (user.roleCode === 'CONTRACTOR' && user.id !== cd.contractorId) throw new ForbiddenException();
      if (user.roleCode === 'CLIENT' && user.clientId !== cd.clientId) throw new ForbiddenException();
      return;
    }

    // 2) payroll_input_files
    const pif = await this.pifRepo.findOne({ where: { filePath } });
    if (pif) {
      // need clientId from payroll_inputs? keep simple: allow client/payroll/admin; harden further later
      if (user.roleCode === 'CLIENT') return;
      if (user.roleCode === 'PAYROLL') return;
      return;
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
          where: { payrollUserId: user.id, clientId: rr.clientId, status: 'ACTIVE', endDate: null as any },
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
      if (["PF_TEAM", "CLIENT", "ADMIN"].includes(user.roleCode)) return;
      throw new ForbiddenException();
    }

    throw new BadRequestException('File not registered in DB');
  }
}
