import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AttendanceService } from './attendance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Attendance')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/attendance', version: '1' })
@Roles('CLIENT', 'ADMIN', 'CRM')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  private resolvePeriod(yearRaw?: string, monthRaw?: string): { year: number; month: number } {
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
    const year = Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : now.getFullYear();
    const month =
      Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
        ? parsedMonth
        : now.getMonth() + 1;

    return { year, month };
  }

  @ApiOperation({ summary: 'Mark Attendance' })
  @Post('mark')
  markAttendance(@Req() req: any, @Body() body: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body.employeeId || !body.date || !body.status) {
      throw new BadRequestException(
        'employeeId, date, and status are required',
      );
    }
    return this.svc.markAttendance(clientId, body);
  }

  @ApiOperation({ summary: 'Bulk Mark' })
  @Post('bulk')
  bulkMark(@Req() req: any, @Body() body: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body.date || !Array.isArray(body.entries)) {
      throw new BadRequestException('date and entries[] are required');
    }
    return this.svc.bulkMark(clientId, body);
  }

  @ApiOperation({ summary: 'List' })
  @Get()
  list(
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!from || !to)
      throw new BadRequestException('from and to date required');
    return this.svc.list({ clientId, branchId, employeeId, from, to });
  }

  @ApiOperation({ summary: 'Get Monthly Summary' })
  @Get('summary')
  getMonthlySummary(
    @Req() req: any,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = req.user?.clientId;
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
    @Req() req: any,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = req.user?.clientId;
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
    @Req() req: any,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = req.user?.clientId;
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
  seedDefaults(@Req() req: any, @Body() body: any) {
    const clientId = req.user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body.year || !body.month) {
      throw new BadRequestException('year and month required');
    }
    return this.svc.seedDefaults(
      clientId,
      body.branchId ?? null,
      body.year,
      body.month,
      body.weeklyOffDays ?? [0],
    );
  }
}
