import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeDocumentEntity } from './entities/employee-document.entity';

@Injectable()
export class EmployeeDocumentService {
  constructor(
    @InjectRepository(EmployeeDocumentEntity)
    private readonly repo: Repository<EmployeeDocumentEntity>,
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

  async findById(id: string) {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async verify(id: string, userId: string) {
    const doc = await this.findById(id);
    doc.isVerified = true;
    doc.verifiedByUserId = userId;
    doc.verifiedAt = new Date();
    return this.repo.save(doc);
  }

  async remove(id: string) {
    const doc = await this.findById(id);
    await this.repo.remove(doc);
    return { deleted: true };
  }
}
