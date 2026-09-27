import {
  Controller,
  Get,
  Query,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CalendarService } from './calendar.service';
import { OperationalScopeService } from '../access/operational-scope.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Calendar')
@ApiBearerAuth('JWT')
@Controller({ path: 'calendar', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly scope: OperationalScopeService,
  ) {}

  @ApiOperation({ summary: 'Get Calendar' })
  @Get()
  async getCalendar(
    @Query() q: CalendarQueryDto,
    @CurrentUser() user: ReqUser,
  ): Promise<any> {
    const roleCode: string = user.roleCode;

    // Block auditor explicitly
    if (roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    const clientId = roleCode === 'CLIENT' ? user.clientId : q.clientId;
    if (!clientId) throw new ForbiddenException('Client not mapped');
    const scope = await this.scope.resolve(user, clientId, q.branchId);
    const branchIds = scope.level === 'branches' ? (scope.branchIds ?? []) : [];
    // An empty branch assignment must not become an unrestricted company query.
    if (scope.level === 'branches' && !branchIds.length) {
      return { from: q.from, to: q.to, items: [] };
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
