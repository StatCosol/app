import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
type UploadedFileT = { originalname: string; buffer: Buffer; mimetype: string };

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReturnsService } from './returns.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import type { ReturnStatus } from './entities/compliance-return.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { DeleteReturnDto } from './dto/delete-return.dto';
import { CrmReturnActionDto } from './dto/crm-return-action.dto';
import { BulkReviewReturnInputDto } from './dto/bulk-review-return-input.dto';
import { BulkMarkReturnFiledDto } from './dto/bulk-mark-return-filed.dto';
import { BulkVerifyReturnTasksDto } from './dto/bulk-verify-return-tasks.dto';
import { BulkReminderDto } from './dto/bulk-reminder.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('Returns')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly auditLogs: AuditLogsService,
    private readonly excel: ExcelExportService,
  ) {}

  /**
   * Compatibility alias for older clients expecting:
   * GET /api/v1/crm/returns
   */
  @ApiOperation({ summary: 'List (Compatibility)' })
  @Get()
  listCompat(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.returns.listForCrm(user, q);
  }

  @ApiOperation({ summary: 'List' })
  @Get('filings')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.returns.listForCrm(user, q);
  }

  @ApiOperation({ summary: 'Types' })
  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @ApiOperation({ summary: 'Create Filing' })
  @Post('filings')
  create(@CurrentUser() user: ReqUser, @Body() dto: CreateReturnDto) {
    return this.returns.createForCrm(user, dto);
  }

  @ApiOperation({ summary: 'Get Filing' })
  @Get('filings/:id')
  getFiling(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.returns.getForCrm(user, id);
  }

  @ApiOperation({ summary: 'CRM Action (RETURN/REMINDER/OWNER/NOTE)' })
  @Post('filings/:id/action')
  action(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: CrmReturnActionDto,
  ) {
    return this.returns.requestUpdateAsCrm(
      user,
      id,
      dto.action,
      dto.message,
      dto.owner,
    );
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch('filings/:id/status')
  updateStatus(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.returns.updateStatusAsCrm(user, id, dto);
  }

  /**
   * Compatibility aliases for older clients expecting:
   * GET /api/v1/crm/returns/:id
   * PATCH /api/v1/crm/returns/:id/status
   */
  @ApiOperation({ summary: 'Get (Compatibility)' })
  @Get(':id')
  getCompat(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.returns.getForCrm(user, id);
  }

  @ApiOperation({ summary: 'Update Status (Compatibility)' })
  @Patch(':id/status')
  updateStatusCompat(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.returns.updateStatusAsCrm(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete Filing' })
  @Patch('filings/:id/delete')
  deleteFiling(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: DeleteReturnDto,
  ) {
    return this.returns.softDeleteAsCrm(user, id, dto.reason);
  }

  /** CRM can upload acknowledgement/challan proofs on behalf of branches */
  @ApiOperation({ summary: 'Upload Ack' })
  @Post('filings/:id/ack')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadAck(
    @Req() req: { body?: { ackNumber?: string } },
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileT,
  ) {
    const ackNumber =
      typeof req.body?.ackNumber === 'string'
        ? req.body.ackNumber.trim() || null
        : null;
    return this.returns.uploadProof(user, id, 'ack', file, ackNumber);
  }

  @ApiOperation({ summary: 'Upload Challan' })
  @Post('filings/:id/challan')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadChallan(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileT,
  ) {
    return this.returns.uploadProof(user, id, 'challan', file);
  }

  // ── Timeline / Approval History ──

  @ApiOperation({ summary: 'Get filing timeline' })
  @Get('filings/:id/timeline')
  getTimeline(@Param('id') id: string) {
    return this.auditLogs.findCombinedTimeline('RETURN_TASK', id, 'RETURN');
  }

  @ApiOperation({ summary: 'Get filing approval history' })
  @Get('filings/:id/approval-history')
  getApprovalHistory(@Param('id') id: string) {
    return this.auditLogs.findApprovalHistory('RETURN', id);
  }

  // ── Export ──

  @ApiOperation({ summary: 'Export filings as CSV' })
  @Get('export/csv')
  async exportCsv(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.returns.listForCrm(user, q);
    const csv = this.returns.buildCsvExport(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="crm-returns-export.csv"',
    );
    res.send(csv);
  }

  @ApiOperation({ summary: 'Export filings as Excel' })
  @Get('export/xlsx')
  async exportXlsx(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.returns.listForCrm(user, q);
    const columns = [
      { key: 'clientName', label: 'Client', width: 24 },
      { key: 'branchName', label: 'Branch', width: 24 },
      { key: 'lawType', label: 'Law Type', width: 16 },
      { key: 'returnType', label: 'Return Type', width: 20 },
      { key: 'periodYear', label: 'Year', width: 10 },
      { key: 'periodMonth', label: 'Month', width: 10 },
      { key: 'dueDate', label: 'Due Date', width: 14 },
      { key: 'filedDate', label: 'Filed Date', width: 14 },
      { key: 'status', label: 'Status', width: 16 },
      { key: 'ackNumber', label: 'ACK Number', width: 20 },
      { key: 'createdByRole', label: 'Created By', width: 14 },
    ];
    const buf = await this.excel.generate(rows, columns, 'Returns');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="crm-returns-export.xlsx"',
    );
    res.send(buf);
  }

  // ── Bulk endpoints ──

  @ApiOperation({ summary: 'Bulk review branch input' })
  @Patch('bulk/review-branch-input')
  async bulkReviewBranchInput(
    @CurrentUser() user: ReqUser,
    @Body() dto: BulkReviewReturnInputDto,
  ) {
    const statusMap: Record<string, string> = {
      READY_FOR_FILING: 'SUBMITTED',
      RETURNED_TO_BRANCH: 'REJECTED',
    };
    const targetStatus = statusMap[dto.action] || dto.action;
    return this.returns.bulkUpdateStatus(
      user,
      dto.taskIds,
      targetStatus as ReturnStatus,
      dto.remarks,
    );
  }

  @ApiOperation({ summary: 'Bulk mark returns as filed' })
  @Patch('bulk/filed')
  async bulkMarkFiled(
    @CurrentUser() user: ReqUser,
    @Body() dto: BulkMarkReturnFiledDto,
  ) {
    return this.returns.bulkMarkFiled(user, dto.taskIds, dto.filedOn);
  }

  @ApiOperation({ summary: 'Bulk verify and close return tasks' })
  @Patch('bulk/verify-close')
  async bulkVerify(
    @CurrentUser() user: ReqUser,
    @Body() dto: BulkVerifyReturnTasksDto,
  ) {
    return this.returns.bulkVerifyAndClose(user, dto.taskIds);
  }

  @ApiOperation({ summary: 'Send bulk reminders' })
  @Post('reminders/bulk')
  async bulkReminder(
    @CurrentUser() user: ReqUser,
    @Body() dto: BulkReminderDto,
  ) {
    return this.returns.sendBulkReminders(user, dto.taskIds, dto.message);
  }
}
