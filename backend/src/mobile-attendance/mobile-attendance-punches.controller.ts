import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { DeviceService } from './devices/device.service';
import { DeviceAuthGuard } from './devices/device-auth.guard';
import { PunchService } from './punch/punch.service';
import { RecordPunchDto } from './punch/punch.dto';
import {
  encryptRosterEmbedding,
  ROSTER_EMBEDDING_TTL_MS,
  rosterPlainEmbeddingsAllowed,
} from './punch/roster-crypto.util';
import {
  mobileAttendanceBranchScope,
  requireMobileAttendanceClient,
} from './mobile-attendance-controller.helpers';

@ApiTags('Mobile Attendance — Punches')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/punches', version: '1' })
export class MobileAttendancePunchesController {
  constructor(
    private readonly punchService: PunchService,
    private readonly deviceService: DeviceService,
  ) {}

  @ApiOperation({
    summary: 'Record an attendance punch (face match + liveness)',
  })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post()
  async recordPunch(@Req() req: Request, @Body() dto: RecordPunchDto) {
    const deviceId = (req as any).deviceId as string;
    const device = await this.deviceService.findById(deviceId);
    if (!device) throw new UnauthorizedException('Device not found');
    const ip = req.ip ?? req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.punchService.recordPunch(device, dto, ip, ua);
  }

  @ApiOperation({ summary: 'Fetch the face roster for offline use' })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Get('roster')
  async getRoster(@Req() req: Request) {
    const deviceId = (req as any).deviceId as string;
    const device = await this.deviceService.findById(deviceId);
    if (!device) throw new UnauthorizedException('Device not found');
    if (device.mode !== 'KIOSK') {
      throw new ForbiddenException(
        'Face roster download is only available on kiosk devices',
      );
    }
    const roster = await this.punchService.getRoster(device);
    const installToken = (req as any).deviceInstallToken as string | undefined;
    if (!installToken) {
      throw new UnauthorizedException('Device install token required');
    }
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ROSTER_EMBEDDING_TTL_MS);
    const plainAllowed = rosterPlainEmbeddingsAllowed();

    return {
      format: plainAllowed ? 'plain-v1' : 'encrypted-v1',
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      deviceId: device.id,
      enrollments: roster.map((r) => {
        const embeddingBytes = Buffer.from(
          r.embedding.buffer,
          r.embedding.byteOffset,
          r.embedding.byteLength,
        );
        const base = {
          employeeId: r.subjectId,
          displayName: r.displayName,
          embeddingModel: r.embeddingModel ?? '',
        };
        if (plainAllowed) {
          return {
            ...base,
            embeddingB64: embeddingBytes.toString('base64'),
          };
        }
        return {
          ...base,
          embeddingCipherB64: encryptRosterEmbedding(
            device.id,
            installToken,
            embeddingBytes,
          ),
        };
      }),
    };
  }

  @ApiOperation({
    summary: 'Admin — list punches held for review (two-level decision)',
  })
  @Get('review')
  @Roles('CLIENT', 'ADMIN')
  listReviewPunches(
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.punchService.listReviewPunches(clientId, {
      status,
      branchIds: branchId ? [branchId] : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({
    summary: 'Admin — approve or reject a punch held for review',
  })
  @Post('review/:subjectType/:punchId')
  @Roles('CLIENT', 'ADMIN')
  reviewPunch(
    @CurrentUser() user: ReqUser,
    @Param('subjectType') subjectType: string,
    @Param('punchId') punchId: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; note?: string },
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const kind = String(subjectType || '').toUpperCase();
    if (kind !== 'EMPLOYEE' && kind !== 'CONTRACTOR') {
      throw new BadRequestException(
        'subjectType must be employee or contractor',
      );
    }
    if (body?.action !== 'APPROVE' && body?.action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT');
    }
    return this.punchService.reviewPunch(
      clientId,
      kind,
      punchId,
      body.action,
      user.id,
      body.note,
      mobileAttendanceBranchScope(user),
    );
  }

  @ApiOperation({
    summary: 'Stream a punch face photo (client + branch scoped)',
  })
  @Get('review/:subjectType/:punchId/photo')
  @Roles('CLIENT', 'ADMIN')
  async getPunchPhoto(
    @CurrentUser() user: ReqUser,
    @Param('subjectType') subjectType: string,
    @Param('punchId') punchId: string,
    @Res() res: Response,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const kind = String(subjectType || '').toUpperCase();
    if (kind !== 'EMPLOYEE' && kind !== 'CONTRACTOR') {
      throw new BadRequestException(
        'subjectType must be employee or contractor',
      );
    }
    const photo = await this.punchService.getPunchPhoto(
      clientId,
      kind,
      punchId,
      mobileAttendanceBranchScope(user),
    );
    if (!photo) throw new NotFoundException('Photo not available');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(photo.buffer);
  }

  @ApiOperation({ summary: 'Admin — list employee punches with filters' })
  @Get('employee')
  @Roles('CLIENT', 'ADMIN')
  listPunches(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.punchService.listPunches(clientId, {
      from,
      to,
      branchId,
      employeeId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({ summary: 'Admin — list contractor punches with filters' })
  @Get('contractor')
  @Roles('CLIENT', 'ADMIN')
  listContractorPunches(
    @CurrentUser() user: ReqUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorEmployeeId') contractorEmployeeId?: string,
    @Query('contractorUserId') contractorUserId?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.punchService.listContractorPunches(clientId, {
      from,
      to,
      branchId,
      contractorEmployeeId,
      contractorUserId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @ApiOperation({ summary: 'Admin — create a manual contractor punch' })
  @Post('contractor')
  @Roles('CLIENT', 'ADMIN')
  createContractorPunch(
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      contractorEmployeeId: string;
      punchTime: string;
      direction: 'IN' | 'OUT' | 'AUTO';
    },
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.punchService.createContractorPunch(clientId, body);
  }

  @ApiOperation({ summary: 'Admin — update a contractor punch' })
  @Put('contractor/:id')
  @Roles('CLIENT', 'ADMIN')
  updateContractorPunch(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { punchTime?: string; direction?: string },
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.punchService.updateContractorPunch(clientId, id, body);
  }

  @ApiOperation({ summary: 'Admin — delete a contractor punch' })
  @Delete('contractor/:id')
  @Roles('CLIENT', 'ADMIN')
  deleteContractorPunch(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    const clientId = requireMobileAttendanceClient(user);
    return this.punchService.deleteContractorPunch(clientId, id);
  }
}
