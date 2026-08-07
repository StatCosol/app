import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { HolidayCalendarService } from './holiday-calendar.service';
import { ApplyHolidaysDto, CreateHolidayDto } from './holiday-calendar.dto';

@ApiTags('Holiday Calendar')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/holidays', version: '1' })
@Roles('CLIENT', 'ADMIN', 'CRM')
export class HolidayCalendarController {
  constructor(private readonly svc: HolidayCalendarService) {}

  @ApiOperation({ summary: 'List holiday calendar' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query('year') year?: string) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.list(clientId, year ? Number(year) : undefined);
  }

  @ApiOperation({ summary: 'Add a holiday' })
  @Post()
  create(@CurrentUser() user: ReqUser, @Body() body: CreateHolidayDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.create(clientId, body);
  }

  @ApiOperation({ summary: 'Upload a holiday list (Excel)' })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: ReqUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.uploadFromExcel(clientId, file);
  }

  @ApiOperation({ summary: 'Apply holidays to attendance for a month' })
  @Post('apply')
  apply(@CurrentUser() user: ReqUser, @Body() body: ApplyHolidaysDto) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!body?.year || !body?.month) {
      throw new BadRequestException('year and month are required');
    }
    return this.svc.applyToAttendance(
      clientId,
      Number(body.year),
      Number(body.month),
      body.branchId,
    );
  }

  @ApiOperation({
    summary: 'List holiday-work (employees who worked on a holiday) for a month',
  })
  @Get('holiday-work')
  holidayWork(
    @CurrentUser() user: ReqUser,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('branchId') branchId?: string,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    if (!year || !month) {
      throw new BadRequestException('year and month are required');
    }
    return this.svc.listHolidayWork(
      clientId,
      Number(year),
      Number(month),
      branchId,
    );
  }

  @ApiOperation({ summary: 'Approve/decline double wage for holiday-work rows' })
  @Post('holiday-work/approve')
  approveHolidayWork(
    @CurrentUser() user: ReqUser,
    @Body() body: { ids: string[]; status: 'APPROVED' | 'DECLINED' },
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.setDoubleWageApproval(clientId, body?.ids, body?.status);
  }

  @ApiOperation({ summary: 'Delete a holiday' })
  @Delete(':id')
  remove(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.svc.remove(clientId, id);
  }
}
