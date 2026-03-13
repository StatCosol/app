import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollProcessingService } from './payroll-processing.service';
import { PfEcrGenerator } from './generators/pf-ecr.generator';
import { EsiGenerator } from './generators/esi.generator';
import { RegisterGenerator } from './generators/register.generator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const breakupUploadOptions = {
  storage: diskStorage({
    destination: (req: any, file: any, cb: any) => {
      const base = path.join(process.cwd(), 'uploads', 'payroll-breakups');
      ensureDir(base);
      cb(null, base);
    },
    filename: (req: any, file: any, cb: any) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  fileFilter: (req: any, file: any, cb: any) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new BadRequestException('Only Excel/CSV files allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/runs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollProcessingController {
  constructor(
    private readonly processingSvc: PayrollProcessingService,
    private readonly pfEcr: PfEcrGenerator,
    private readonly esi: EsiGenerator,
    private readonly register: RegisterGenerator,
  ) {}

  // Upload breakup Excel
  @ApiOperation({ summary: 'Upload Breakup' })
  @Post(':runId/upload-breakup')
  @UseInterceptors(FileInterceptor('file', breakupUploadOptions))
  uploadBreakup(@Param('runId') runId: string, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('File is required');
    return this.processingSvc.uploadBreakup(runId, file);
  }

  // Process payroll run (compute statutory deductions)
  @ApiOperation({ summary: 'Process Run' })
  @Post(':runId/process')
  processRun(@Param('runId') runId: string) {
    return this.processingSvc.processRun(runId);
  }

  // Generate PF ECR text file
  @ApiOperation({ summary: 'Generate Pf Ecr' })
  @Post(':runId/generate/pf-ecr')
  async generatePfEcr(@Param('runId') runId: string, @Res() res: Response) {
    const result = await this.pfEcr.generate(runId);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.content);
  }

  // Generate ESI contribution file
  @ApiOperation({ summary: 'Generate Esi' })
  @Post(':runId/generate/esi')
  async generateEsi(@Param('runId') runId: string, @Res() res: Response) {
    const result = await this.esi.generate(runId);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`,
    );
    res.end(result.content);
  }

  // Generate state-wise register
  @ApiOperation({ summary: 'Generate Register' })
  @Post(':runId/generate/registers')
  generateRegister(
    @Req() req: any,
    @Param('runId') runId: string,
    @Query('stateCode') stateCode: string,
    @Query('registerType') registerType: string,
  ) {
    if (!stateCode || !registerType) {
      throw new BadRequestException('stateCode and registerType are required');
    }
    return this.register.generate(
      runId,
      stateCode,
      registerType,
      req.user.userId,
    );
  }

  // List available register templates
  @ApiOperation({ summary: 'List Templates' })
  @Get('register-templates')
  @Roles('PAYROLL', 'ADMIN', 'CRM')
  listTemplates(@Query('stateCode') stateCode?: string) {
    return this.register.listTemplates(stateCode);
  }
}
