import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { DeviceAuthGuard } from './devices/device-auth.guard';
import { LivenessService } from './liveness/liveness.service';
import { IssueChallengeDto } from './liveness/liveness.dto';

@ApiTags('Mobile Attendance — Liveness')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/liveness', version: '1' })
export class MobileAttendanceLivenessController {
  constructor(private readonly livenessService: LivenessService) {}

  @ApiOperation({ summary: 'Issue a liveness challenge nonce for a device' })
  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post('challenge')
  issueChallenge(@Req() req: Request, @Body() dto: IssueChallengeDto) {
    const deviceId = (req as any).deviceId as string;
    return this.livenessService.issueChallenge(
      deviceId,
      dto.employeeId,
      dto.offline ?? false,
    );
  }
}
