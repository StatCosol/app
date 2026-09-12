import {
  Body,
  Controller,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { LegitxAssistantService } from './legitx-assistant.service';
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH_DESK')
@Controller({ path: 'legitx/assistant', version: '1' })
export class LegitxAssistantController {
  constructor(private readonly assistant: LegitxAssistantService) {}
  @Post('plan')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  plan(
    @CurrentUser() user: ReqUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    return this.assistant.plan(user, query);
  }
}
