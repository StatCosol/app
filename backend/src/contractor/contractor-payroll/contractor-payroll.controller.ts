import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { makeSafeUploadOptions } from '../../common/safe-upload';
import { ContractorPayrollService } from './contractor-payroll.service';

@Controller('contractor-payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractorPayrollController {
  constructor(private readonly svc: ContractorPayrollService) {}

  // ─── Attendance Template Download ─────────────────────────────────────────

  @Get('attendance/template')
  @Roles('CONTRACTOR', 'BRANCH_DESK', 'CLIENT', 'AUDITOR')
  async downloadTemplate(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('branchId') branchId: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const { clientId } = req.user;
    const buf = await this.svc.generateAttendanceTemplate(
      clientId,
      branchId ?? null,
      m,
      y,
    );
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="attendance-template-${y}-${m}.xlsx"`,
    });
    res.send(buf);
  }

  // ─── Upload Attendance Excel ───────────────────────────────────────────────

  @Post('attendance/upload')
  @Roles('CONTRACTOR', 'BRANCH_DESK', 'CLIENT')
  @UseInterceptors(FileInterceptor('file', makeSafeUploadOptions({ memory: true })))
  async uploadAttendance(
    @UploadedFile() file: Express.Multer.File,
    @Body('month') month: string,
    @Body('year') year: string,
    @Body('branchId') branchId: string | undefined,
    @Req() req: any,
  ) {
    const { clientId, userId } = req.user;
    return this.svc.processAttendanceUpload(
      file,
      clientId,
      branchId ?? null,
      userId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  // ─── Wage Breakup Template Download ──────────────────────────────────────

  @Get('wage-breakup/template')
  @Roles('CLIENT', 'BRANCH_DESK')
  async downloadBreakupTemplate(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('branchId') branchId: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const { clientId } = req.user;
    const buf = await this.svc.generateWageBreakupTemplate(clientId, branchId ?? null, m, y);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="wage-breakup-template-${y}-${m}.xlsx"`,
    });
    res.send(buf);
  }

  // ─── Upload Wage Breakup ──────────────────────────────────────────────────

  @Post('wage-breakup/upload')
  @Roles('CLIENT', 'BRANCH_DESK')
  @UseInterceptors(FileInterceptor('file', makeSafeUploadOptions({ memory: true })))
  async uploadWageBreakup(
    @UploadedFile() file: Express.Multer.File,
    @Body('month') month: string,
    @Body('year') year: string,
    @Body('branchId') branchId: string | undefined,
    @Req() req: any,
  ) {
    const { clientId, userId } = req.user;
    return this.svc.processWageBreakupUpload(
      file,
      clientId,
      branchId ?? null,
      userId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  // ─── Get Wage Breakup Rows ────────────────────────────────────────────────

  @Get('wage-breakup')
  @Roles('CLIENT', 'BRANCH_DESK', 'AUDITOR', 'CONTRACTOR')
  async getWageBreakup(
    @Query('month') month: string,
    @Query('year') year: string,
    @Req() req: any,
  ) {
    const { clientId } = req.user;
    return this.svc.getWageBreakup(clientId, parseInt(month, 10), parseInt(year, 10));
  }

  // ─── Generate / Refresh Wage Sheet ────────────────────────────────────────

  @Post('sheet/generate')
  @Roles('BRANCH_DESK', 'CLIENT')
  async generateSheet(
    @Body('month') month: number,
    @Body('year') year: number,
    @Body('branchId') branchId: string | undefined,
    @Req() req: any,
  ) {
    const { clientId, userId } = req.user;
    return this.svc.generateSheet(clientId, branchId ?? null, month, year, userId);
  }

  // ─── Get Sheet + Rows ─────────────────────────────────────────────────────

  @Get('sheet')
  @Roles('CONTRACTOR', 'BRANCH_DESK', 'CLIENT', 'AUDITOR')
  async getSheet(
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('branchId') branchId: string | undefined,
    @Req() req: any,
  ) {
    const { clientId } = req.user;
    return this.svc.getSheet(clientId, branchId ?? null, parseInt(month, 10), parseInt(year, 10));
  }

  // ─── List All Sheets ──────────────────────────────────────────────────────

  @Get('sheets')
  @Roles('BRANCH_DESK', 'CLIENT', 'AUDITOR')
  async listSheets(
    @Query('year') year: string | undefined,
    @Query('branchIds') branchIds: string | undefined,
    @Req() req: any,
  ) {
    const { clientId } = req.user;
    const ids = branchIds ? branchIds.split(',').filter(Boolean) : [];
    return this.svc.listSheets(clientId, ids, year ? parseInt(year, 10) : undefined);
  }

  // ─── Submit Sheet (Branch Desk → Client) ──────────────────────────────────

  @Post('sheet/:id/submit')
  @Roles('BRANCH_DESK')
  async submitSheet(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const { clientId, userId } = req.user;
    return this.svc.submitSheet(clientId, id, userId);
  }

  // ─── Approve Sheet (Client User) ──────────────────────────────────────────

  @Post('sheet/:id/approve')
  @Roles('CLIENT')
  async approveSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('note') note: string | undefined,
    @Req() req: any,
  ) {
    const { clientId, userId } = req.user;
    return this.svc.reviewSheet(clientId, id, 'APPROVE', note ?? null, userId);
  }

  // ─── Reject Sheet (Client User) ───────────────────────────────────────────

  @Post('sheet/:id/reject')
  @Roles('CLIENT')
  async rejectSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('note') note: string,
    @Req() req: any,
  ) {
    const { clientId, userId } = req.user;
    return this.svc.reviewSheet(clientId, id, 'REJECT', note, userId);
  }

  // ─── Export Sheet as Excel ────────────────────────────────────────────────

  @Get('sheet/:id/export')
  @Roles('BRANCH_DESK', 'CLIENT', 'AUDITOR')
  async exportSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { clientId } = req.user;
    const { buffer, filename } = await this.svc.exportSheet(clientId, id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }
}
