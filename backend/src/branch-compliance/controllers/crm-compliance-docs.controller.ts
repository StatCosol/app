import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import {
  ReviewComplianceDocDto,
  ChecklistQueryDto,
  UploadComplianceDocDto,
} from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/branch-compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** List documents pending review */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: ChecklistQueryDto) {
    return this.svc.listForCrmReview(user, q);
  }

  /** Approve or reject a document */
  @ApiOperation({ summary: 'Review' })
  @Patch(':id/review')
  review(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: ReviewComplianceDocDto,
  ) {
    return this.svc.reviewDocument(user, id, dto);
  }

  /** CRM upload on behalf of branch */
  @ApiOperation({ summary: 'CRM Upload On Behalf' })
  @Post('upload-on-behalf')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadOnBehalf(
    @CurrentUser() user: ReqUser,
    @Body() dto: UploadComplianceDocDto & { companyId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.crmUploadOnBehalf(user, dto, {
      originalname: file.originalname,
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
  }

  /** Get return master list (for filters) */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: Record<string, string>) {
    return this.svc.getReturnMaster(q);
  }

  /** Dashboard KPIs for CRM */
  @ApiOperation({ summary: 'Dashboard Kpis' })
  @Get('dashboard-kpis')
  dashboardKpis(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.getCrmDashboardKpis(user, {
      companyId: q.companyId,
      year: q.year ? Number(q.year) : undefined,
      month: q.month ? Number(q.month) : undefined,
      frequency: q.frequency || undefined,
    });
  }
}
