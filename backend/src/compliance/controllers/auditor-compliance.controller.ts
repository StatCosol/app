import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CreateReuploadRequestsDto } from '../dto/create-reupload-requests.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
  root(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListTasks(req.user, q);
  }

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  list(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListTasks(req.user, q);
  }

  @ApiOperation({ summary: 'Detail' })
  @Get('tasks/:id')
  detail(@Req() req: any, @Param('id') id: string) {
    return this.svc.auditorGetTaskDetail(req.user, id);
  }

  // Read-only audit/compliance visibility for auditors
  @ApiOperation({ summary: 'List Docs' })
  @Get('docs')
  listDocs(@Req() req: any, @Query() filters: any) {
    return this.svc.auditorListDocs(req.user, filters);
  }

  // ===== Reupload Requests =====

  @ApiOperation({ summary: 'Create Reupload Requests' })
  @Post('reupload-requests')
  createReuploadRequests(
    @Req() req: any,
    @Body() dto: CreateReuploadRequestsDto,
  ) {
    return this.svc.createReuploadRequestsFromAuditor(req.user, dto);
  }

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(@Req() req: any, @Query() q: any) {
    return this.svc.auditorListReuploadRequests(req.user, q);
  }

  @ApiOperation({ summary: 'Approve Reupload' })
  @Post('reupload-requests/:id/approve')
  approveReupload(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { remarks?: string },
  ) {
    return this.svc.auditorApproveReupload(req.user, id, dto.remarks);
  }

  @ApiOperation({ summary: 'Reject Reupload' })
  @Post('reupload-requests/:id/reject')
  rejectReupload(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.auditorRejectReupload(req.user, id, dto.remarks);
  }
}
