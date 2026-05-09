import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { BiometricService } from './biometric.service';
import { IngestPunchesDto, ProcessPunchesDto } from './biometric.dto';

@ApiTags('Biometric')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/biometric', version: '1' })
@Roles('CLIENT', 'ADMIN', 'CRM')
export class BiometricController {
  constructor(private readonly svc: BiometricService) {}

  @ApiOperation({
    summary: 'Ingest raw punches from a biometric/facial-scan device',
  })
  @Post('punches/ingest')
  ingest(@CurrentUser() user: ReqUser, @Body() body: IngestPunchesDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.ingest(
      clientId,
      body.punches,
      body.autoProcess !== false, // default true
    );
  }

  @ApiOperation({ summary: 'List raw punches in a date range' })
  @Get('punches')
  list(
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!from || !to)
      throw new BadRequestException('from and to date required');
    return this.svc.list({
      clientId,
      from,
      to,
      branchId,
      employeeId,
      deviceId,
    });
  }

  @ApiOperation({
    summary:
      'Recompute attendance_records from punches in a date range (in/out + OT)',
  })
  @Post('process')
  process(@CurrentUser() user: ReqUser, @Body() body: ProcessPunchesDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.processRange(
      clientId,
      body.from,
      body.to,
      !!body.reprocess,
    );
  }

  @ApiOperation({
    summary:
      'Resolve any past punches whose employee_code now matches a known employee',
  })
  @Post('reconcile')
  reconcile(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.reconcileUnknown(clientId);
  }
}
