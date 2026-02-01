import { Controller, Get, Query, Req, Res, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import * as path from 'path';
import * as fs from 'fs';
import type { Response } from 'express';
import { FilesService } from './files.service';

@Controller('api/files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CLIENT', 'PAYROLL', 'PF_TEAM', 'CRM', 'AUDITOR', 'CONTRACTOR')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('download')
  async download(@Req() req: any, @Query('p') p: string, @Res() res: Response) {
    if (!p) throw new BadRequestException('p required');

    // ownership check (DB-based)
    await this.filesService.assertCanDownload(req.user, p);

    // prevent path traversal
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const resolved = path.resolve(p);

    if (!resolved.startsWith(uploadsRoot)) {
      throw new ForbiddenException('Invalid path');
    }

    if (!fs.existsSync(resolved)) {
      throw new BadRequestException('File not found');
    }

    return res.download(resolved);
  }
}
