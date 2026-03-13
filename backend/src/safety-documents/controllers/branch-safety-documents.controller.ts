import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { BranchAccessService } from '../../auth/branch-access.service';
import { SafetyDocumentsService } from '../safety-documents.service';
import { UploadSafetyDocumentDto } from '../dto/upload-safety-document.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Branch user controller for safety documents.
 * Branch users can upload, list, and delete their own safety documents.
 * Base: /api/v1/branch/safety-documents
 */
@ApiTags('Safety Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch/safety-documents', version: '1' })
@Roles('CLIENT')
export class BranchSafetyDocumentsController {
  constructor(
    private readonly svc: SafetyDocumentsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** Get master document list (seed data for dropdowns) */
  @ApiOperation({ summary: 'Get Master List' })
  @Get('master')
  async getMasterList(@Query() query: any) {
    return this.svc.getMasterList({
      frequency: query.frequency,
      category: query.category,
      applicableTo: query.applicableTo,
    });
  }

  /** Get master categories */
  @ApiOperation({ summary: 'Get Categories' })
  @Get('categories')
  async getCategories() {
    return this.svc.getMasterCategories();
  }

  /** Get Safety Risk Score for branch */
  @ApiOperation({ summary: 'Get Safety Score' })
  @Get('safety-score')
  async getSafetyScore(@Req() req: any) {
    const userId = req.user.id;
    const clientId = req.user.clientId;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);

    if (!branchIds.length) {
      return this.svc.getSafetyScore({ clientId });
    }
    return this.svc.getSafetyScore({ branchIds });
  }

  /** Upload a safety document */
  @ApiOperation({ summary: 'File Interceptor' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async upload(
    @UploadedFile() file: any,
    @Body() dto: UploadSafetyDocumentDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    const clientId = req.user.clientId;

    if (!clientId) {
      return { error: 'No client assigned to this user' };
    }

    // Verify the user has access to this branch
    const branchIds = await this.branchAccess.getUserBranchIds(userId);
    if (branchIds.length > 0 && !branchIds.includes(dto.branchId)) {
      return { error: 'You do not have access to this branch' };
    }

    const doc = await this.svc.upload(dto, file, userId, clientId);
    return {
      id: doc.id,
      fileName: doc.fileName,
      documentName: doc.documentName,
      category: doc.category,
      frequency: doc.frequency,
      createdAt: doc.createdAt,
    };
  }

  /** List safety documents for the branch user's branch(es) */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@Req() req: any, @Query() query: any) {
    const userId = req.user.id;
    const clientId = req.user.clientId;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);

    // Master user: fetch all branches for client
    if (!branchIds.length) {
      const allBranches = await this.svc['repo'].manager.query(
        `SELECT id FROM client_branches WHERE clientid = $1 AND deletedat IS NULL`,
        [clientId],
      );
      const allIds = allBranches.map((r: any) => r.id);
      if (!allIds.length) return [];
      return this.svc.listForBranch(allIds, {
        documentType: query.documentType,
        category: query.category,
        frequency: query.frequency,
      });
    }

    return this.svc.listForBranch(branchIds, {
      documentType: query.documentType,
      category: query.category,
      frequency: query.frequency,
    });
  }

  /** Get expiring safety documents for branch user */
  @ApiOperation({ summary: 'Get Expiring' })
  @Get('expiring')
  async getExpiring(@Req() req: any) {
    const userId = req.user.id;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);

    if (!branchIds.length) {
      // Master user: get all for client
      return this.svc.getExpiringDocuments({ clientId: req.user.clientId });
    }

    return this.svc.getExpiringDocuments({ branchIds });
  }

  /** Delete a safety document */
  @ApiOperation({ summary: 'Delete' })
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);

    // Master user can delete any of their client's documents
    if (!branchIds.length) {
      const clientId = req.user.clientId;
      const allBranches = await this.svc['repo'].manager.query(
        `SELECT id FROM client_branches WHERE clientid = $1 AND deletedat IS NULL`,
        [clientId],
      );
      return this.svc.deleteBranch(
        id,
        userId,
        allBranches.map((r: any) => r.id),
      );
    }

    return this.svc.deleteBranch(id, userId, branchIds);
  }

  /** Download a safety document */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // Verify user has access to this document's branch
    const doc = await this.svc.getDocumentEntity(id);
    const userId = req.user.id;
    const branchIds = await this.branchAccess.getUserBranchIds(userId);

    if (branchIds.length > 0 && !branchIds.includes(doc.branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }
}
