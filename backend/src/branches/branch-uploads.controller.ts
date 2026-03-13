import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchAccessService } from '../auth/branch-access.service';
import { BranchDocumentsService } from './branch-documents.service';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

@Controller({ path: 'branch/uploads', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH_DESK', 'BRANCH_USER')
export class BranchUploadsController {
  constructor(
    private readonly branchAccess: BranchAccessService,
    private readonly branchDocumentsService: BranchDocumentsService,
  ) {}

  private async resolveBranchId(
    req: any,
    queryBranchId?: string,
  ): Promise<string> {
    if (queryBranchId) {
      await this.branchAccess.assertBranchAccess(
        req.user.userId,
        queryBranchId,
      );
      return queryBranchId;
    }

    const allowed = await this.branchAccess.getAllowedBranchIds(
      req.user.userId,
      req.user.clientId,
    );

    if (allowed === 'ALL') {
      throw new BadRequestException(
        'branchId query parameter is required for master user',
      );
    }

    if (!allowed.length) {
      throw new BadRequestException('No branch mapped to this user');
    }

    return allowed[0];
  }

  @Get('pending')
  async pending(@Req() req: any, @Query('branchId') branchId?: string) {
    const resolvedBranchId = await this.resolveBranchId(req, branchId);
    const now = new Date();

    const rows = await this.branchDocumentsService.listByBranch(
      resolvedBranchId,
      req.user.clientId,
      {
        category: 'COMPLIANCE_MONTHLY',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      },
    );

    return rows.map((row: any) => ({
      id: row.id,
      title: row.docType,
      documentType: row.docType,
      status: row.status,
      dueDate: null,
    }));
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(process.cwd(), 'uploads', 'branch-documents');
          ensureDir(dir);
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          cb(null, `${Date.now()}_${safe}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @Req() req: any,
    @Body()
    body: {
      branchId?: string;
      documentType: string;
      periodYear?: string | number;
      periodMonth?: string | number;
    },
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    if (!body.documentType?.trim()) {
      throw new BadRequestException('documentType is required');
    }

    const resolvedBranchId = await this.resolveBranchId(req, body.branchId);
    const now = new Date();
    const periodYear = body.periodYear
      ? Number(body.periodYear)
      : now.getFullYear();
    const periodMonth = body.periodMonth
      ? Number(body.periodMonth)
      : now.getMonth() + 1;

    return this.branchDocumentsService.upload(
      resolvedBranchId,
      req.user.clientId,
      {
        category: 'COMPLIANCE_MONTHLY',
        docType: body.documentType.trim(),
        periodYear,
        periodMonth,
      },
      file,
      req.user.userId,
    );
  }
}
