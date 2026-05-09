import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CreateReuploadRequestsDto } from '../dto/create-reupload-requests.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  // Lightweight summary list to avoid 404 when hitting base path
  @ApiOperation({ summary: 'Root' })
  @Get()
  root(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.auditorListTasks(user, q);
  }

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.auditorListTasks(user, q);
  }

  @ApiOperation({ summary: 'Detail' })
  @Get('tasks/:id')
  detail(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.auditorGetTaskDetail(user, id);
  }

  @ApiOperation({ summary: 'Share Report' })
  @Post('tasks/:id/report')
  shareReport(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { notes: string },
  ) {
    return this.svc.auditorShareReport(user, id, dto.notes);
  }

  // Read-only audit/compliance visibility for auditors
  @ApiOperation({ summary: 'List Docs' })
  @Get('docs')
  listDocs(
    @CurrentUser() user: ReqUser,
    @Query() filters: Record<string, string>,
  ) {
    return this.svc.auditorListDocs(user, filters);
  }

  // ===== Reupload Requests =====

  @ApiOperation({ summary: 'Create Reupload Requests' })
  @Post('reupload-requests')
  createReuploadRequests(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateReuploadRequestsDto,
  ) {
    return this.svc.createReuploadRequestsFromAuditor(user, dto);
  }

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.auditorListReuploadRequests(user, q);
  }

  @ApiOperation({ summary: 'Approve Reupload' })
  @Post('reupload-requests/:id/approve')
  approveReupload(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.svc.auditorApproveReupload(user, id, dto.remarks);
  }

  @ApiOperation({ summary: 'Reject Reupload' })
  @Post('reupload-requests/:id/reject')
  rejectReupload(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.auditorRejectReupload(user, id, dto.remarks);
  }
}
