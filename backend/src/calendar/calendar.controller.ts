import {
  Controller,
  Get,
  Query,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CalendarService } from './calendar.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Calendar')
@ApiBearerAuth('JWT')
@Controller({ path: 'calendar', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  @ApiOperation({ summary: 'Get Calendar' })
  @Get()
  async getCalendar(
    @Query() q: CalendarQueryDto,
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;
    const roleCode: string = user.roleCode;

    // Block auditor explicitly
    if (roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    let clientId: string;
    let branchIds: string[] = [];

    if (roleCode === 'CLIENT') {
      // CLIENT user: clientId from JWT, branchIds from JWT (empty = master)
      clientId = user.clientId;
      if (!clientId) throw new ForbiddenException('Client not mapped');
      branchIds = user.branchIds ?? [];
    } else if (roleCode === 'CRM') {
      // CRM user: clientId required as query param, verify assignment
      clientId = q.clientId!;
      if (!clientId) throw new ForbiddenException('clientId required for CRM');
      const assigned = await this.assignmentsService.isClientAssignedToCrm(
        clientId,
        user.sub ?? user.userId,
      );
      if (!assigned) throw new ForbiddenException('Client not assigned to you');
    } else {
      // ADMIN/CCO/CEO: clientId required as query param
      clientId = q.clientId!;
      if (!clientId) throw new ForbiddenException('clientId required');
    }

    return this.calendarService.getCalendar({
      clientId,
      branchIds,
      from: q.from,
      to: q.to,
      branchId: q.branchId,
      module: q.module,
    });
  }
}
