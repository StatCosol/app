import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonthlyComplianceUploadEntity } from './entities/monthly-compliance-upload.entity';
import { BranchAccessService } from '../auth/branch-access.service';
import * as fs from 'fs';
import * as path from 'path';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
};

@Injectable()
export class MonthlyDocumentsService {
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
  ]);

  constructor(
    @InjectRepository(MonthlyComplianceUploadEntity)
    private readonly repo: Repository<MonthlyComplianceUploadEntity>,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // ═══════════════════════════════════════════════════
  // LIST documents for a branch + month
  // ═══════════════════════════════════════════════════
  async list(
    user: { id: string; clientId: string },
    branchId: string,
    month: string,
    code?: string,
  ): Promise<MonthlyComplianceUploadEntity[]> {
    // Verify branch access
    await this.branchAccess.assertBranchAccess(user.id, branchId);

    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.branch_id = :branchId', { branchId })
      .andWhere('d.month = :month', { month })
      .andWhere('d.is_deleted = false');

    if (code) {
      qb.andWhere('d.code = :code', { code });
    }

    return qb.orderBy('d.created_at', 'DESC').getMany();
  }

  // ═══════════════════════════════════════════════════
  // UPLOAD a document
  // ═══════════════════════════════════════════════════
  async upload(
    user: { id: string; clientId: string },
    branchId: string,
    month: string,
    code: string,
    file: UploadedFile,
  ): Promise<MonthlyComplianceUploadEntity> {
    if (!file?.buffer) throw new BadRequestException('File is required');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed`,
      );
    }

    // Verify branch access
    await this.branchAccess.assertBranchAccess(user.id, branchId);

    // Save file to disk
    const dir = path.join(
      process.cwd(),
      'uploads',
      'monthly-compliance',
      branchId,
      month,
    );
    fs.mkdirSync(dir, { recursive: true });

    const ts = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskName = `${ts}_${code}_${safeName}`;
    const filePath = path.join(dir, diskName);
    fs.writeFileSync(filePath, file.buffer);

    const relativePath = path.relative(
      path.join(process.cwd(), 'uploads'),
      filePath,
    );

    const entity = this.repo.create({
      clientId: user.clientId,
      branchId,
      month,
      code,
      fileName: file.originalname,
      filePath: relativePath,
      fileSize: file.size || file.buffer.length,
      mimeType: file.mimetype,
      uploadedBy: user.id,
    });

    return this.repo.save(entity);
  }

  // ═══════════════════════════════════════════════════
  // DELETE (soft)
  // ═══════════════════════════════════════════════════
  async remove(
    user: { id: string; clientId: string },
    docId: string,
  ): Promise<{ deleted: true }> {
    const doc = await this.repo.findOne({
      where: { id: docId, isDeleted: false },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // Verify branch access
    await this.branchAccess.assertBranchAccess(user.id, doc.branchId);

    doc.isDeleted = true;
    await this.repo.save(doc);
    return { deleted: true };
  }
}
