import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { AuditFollowUpsService } from './audit-follow-ups.service';

export class AuditFollowUpQuery {
  @IsOptional()
  @IsIn(['PENDING', 'RETRY', 'SUCCEEDED', 'SKIPPED', 'FAILED'])
  status?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

@Controller({ path: 'admin/audit-follow-ups', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditFollowUpsController {
  constructor(private readonly followUps: AuditFollowUpsService) {}

  @Get()
  list(@CurrentUser() user: ReqUser, @Query() query: AuditFollowUpQuery) {
    return this.followUps.list(user, query.status, query.page, query.limit);
  }

  @Post(':id/retry')
  retry(
    @CurrentUser() user: ReqUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.followUps.retry(user, id);
  }
}
