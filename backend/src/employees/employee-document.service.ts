import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeDocumentEntity } from './entities/employee-document.entity';
import { EmployeeEntity } from './entities/employee.entity';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

@Injectable()
export class EmployeeDocumentService {
  constructor(
    @InjectRepository(EmployeeDocumentEntity)
    private readonly repo: Repository<EmployeeDocumentEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    private readonly access: AccessScopeService,
  ) {}

  async upload(params: {
    clientId: string;
    employeeId: string;
    docType: string;
    docName: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType?: string;
    uploadedByUserId: string;
    expiryDate?: string;
  }) {
    const entity = this.repo.create({
      clientId: params.clientId,
      employeeId: params.employeeId,
      docType: params.docType,
      docName: params.docName,
      fileName: params.fileName,
      filePath: params.filePath,
      fileSize: params.fileSize,
      mimeType: params.mimeType ?? null,
      uploadedByUserId: params.uploadedByUserId,
      expiryDate: params.expiryDate ?? null,
    });
    return this.repo.save(entity);
  }

  async listForEmployee(clientId: string, employeeId: string) {
    return this.repo.find({
      where: { clientId, employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * A document the caller may act on. Looked up by id alone, this used to let
   * any CLIENT or CRM user download, verify or delete another company's
   * employee documents. The branch comes from the employee, so a branch user
   * is held to their own branches too.
   */
  async findForUser(id: string, user: ReqUser) {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    const emp = await this.empRepo.findOne({
      where: { id: doc.employeeId },
      select: ['id', 'branchId'],
    });
    await this.access.assertDocumentInScope(user, {
      clientId: doc.clientId,
      branchId: emp?.branchId ?? null,
    });
    return doc;
  }

  async verify(id: string, user: ReqUser) {
    const doc = await this.findForUser(id, user);
    const userId = user.userId;
    doc.isVerified = true;
    doc.verifiedByUserId = userId;
    doc.verifiedAt = new Date();
    return this.repo.save(doc);
  }

  async remove(id: string, user: ReqUser) {
    const doc = await this.findForUser(id, user);
    await this.repo.remove(doc);
    return { deleted: true };
  }
}
