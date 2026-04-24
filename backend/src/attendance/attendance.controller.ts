import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AttendanceService } from './attendance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  MarkAttendanceDto,
  BulkMarkAttendanceDto,
  SeedDefaultsDto,
  EditAttendanceDto,
  ApproveAttendanceDto,
  RejectAttendanceDto,
} from './attendance.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Attendance')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/attendance', version: '1' })
@Roles('CLIENT', 'ADMIN', 'CRM')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  private resolvePeriod(
    yearRaw?: string,
    monthRaw?: string,
  ): { year: number; month: number } {
    const now = new Date();

    // Supports month=YYYY-MM
    if (monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)) {
      const [y, m] = monthRaw.split('-').map((x) => parseInt(x, 10));
      if (y > 1900 && m >= 1 && m <= 12) {
        return { year: y, month: m };
      }
    }

    const parsedYear = yearRaw ? parseInt(yearRaw, 10) : NaN;
    const parsedMonth = monthRaw ? parseInt(monthRaw, 10) : NaN;
    const year =
      Number.isFinite(parsedYear) && parsedYear > 1900
        ? parsedYear
        : now.getFullYear();
    const month =
      Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : now.getMonth() + 1;

    return { year, month };
  }

  @ApiOperation({ summary: 'Mark Attendance' })
  @Post('mark')
  markAttendance(
    @CurrentUser() user: ReqUser,
    @Body() body: MarkAttendanceDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.markAttendance(clientId, body);
  }

  @ApiOperation({ summary: 'Bulk Mark' })
  @Post('bulk')
  bulkMark(@CurrentUser() user: ReqUser, @Body() body: BulkMarkAttendanceDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.bulkMark(clientId, body);
  }

  @ApiOperation({ summary: 'List' })
  @Get()
  list(
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!from || !to)
      throw new BadRequestException('from and to date required');
    return this.svc.list({ clientId, branchId, employeeId, from, to });
  }

  @ApiOperation({ summary: 'Get Monthly Summary' })
  @Get('summary')
  getMonthlySummary(
    @CurrentUser() user: ReqUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const period = this.resolvePeriod(year, month);
    return this.svc.getMonthlySummary({
      clientId,
      branchId,
      year: period.year,
      month: period.month,
    });
  }

  @ApiOperation({ summary: 'Get Attendance Mismatches' })
  @Get('mismatches')
  getMismatches(
    @CurrentUser() user: ReqUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const period = this.resolvePeriod(year, month);
    return this.svc.getMismatches({
      clientId,
      branchId,
      year: period.year,
      month: period.month,
    });
  }

  @ApiOperation({ summary: 'Get LOP Preview' })
  @Get('lop-preview')
  getLopPreview(
    @CurrentUser() user: ReqUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const period = this.resolvePeriod(year, month);
    return this.svc.getLopPreview({
      clientId,
      branchId,
      year: period.year,
      month: period.month,
    });
  }

  @ApiOperation({ summary: 'Seed Defaults' })
  @Post('seed-defaults')
  seedDefaults(@CurrentUser() user: ReqUser, @Body() body: SeedDefaultsDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.seedDefaults(
      clientId,
      body.branchId ?? null,
      body.year,
      body.month,
      body.weeklyOffDays ?? [0],
    );
  }

  // ── Daily Attendance Management ────────────────────────────

  @ApiOperation({ summary: 'List daily attendance with employee names' })
  @Get('daily')
  listDaily(
    @CurrentUser() user: ReqUser,
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @Query('approvalStatus') approvalStatus?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!date) throw new BadRequestException('date query param required');
    return this.svc.listDaily({ clientId, date, branchId, approvalStatus });
  }

  @ApiOperation({ summary: 'Get approval stats for a date' })
  @Get('daily/stats')
  getApprovalStats(
    @CurrentUser() user: ReqUser,
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!date) throw new BadRequestException('date query param required');
    return this.svc.getApprovalStats(clientId, date, branchId);
  }

  @ApiOperation({ summary: 'Edit an attendance record' })
  @Put(':id')
  editRecord(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: EditAttendanceDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.editRecord(clientId, id, body);
  }

  @ApiOperation({ summary: 'Bulk approve attendance records' })
  @Post('approve')
  approveRecords(
    @CurrentUser() user: ReqUser,
    @Body() body: ApproveAttendanceDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.approveRecords(clientId, body.ids, user.userId ?? user.id);
  }

  @ApiOperation({ summary: 'Bulk reject attendance records' })
  @Post('reject')
  rejectRecords(
    @CurrentUser() user: ReqUser,
    @Body() body: RejectAttendanceDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.rejectRecords(
      clientId,
      body.ids,
      user.userId ?? user.id,
      body.reason,
    );
  }
}
