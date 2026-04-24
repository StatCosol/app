import {
  UnauthorizedException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { FilesService } from './files.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReqUser } from '../access/access-scope.service';
import { UsersService } from '../users/users.service';

@ApiTags('Files')
@ApiBearerAuth('JWT')
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  @ApiOperation({ summary: 'Download' })
  @Get('download')
  async download(
    @Req() req: Request,
    @Query('p') p: string,
    @Res() res: Response,
  ) {
    if (!p) throw new BadRequestException('p required');
    const user = await this.authenticateRequest(req);

    // ownership check (DB-based)
    await this.filesService.assertCanDownload(user, p);

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

  private async authenticateRequest(req: Request): Promise<ReqUser> {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';
    const token = bearerToken || '';
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload?.type !== 'access' || !payload?.sub) {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.isActive === false || user.deletedAt != null) {
      throw new UnauthorizedException('User not found');
    }

    const roleCode = await this.usersService.getUserRoleCode(user.id);
    if (
      ![
        'ADMIN',
        'CLIENT',
        'PAYROLL',
        'PF_TEAM',
        'CRM',
        'AUDITOR',
        'CONTRACTOR',
      ].includes(roleCode)
    ) {
      throw new ForbiddenException('You do not have permission to access files');
    }

    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      roleCode,
      clientId: user.clientId ?? null,
      userType: user.userType ?? null,
      branchIds: Array.isArray(payload?.branchIds) ? payload.branchIds : [],
      assignedClientIds: [],
      employeeId: user.employeeId ?? null,
    };
  }
}
