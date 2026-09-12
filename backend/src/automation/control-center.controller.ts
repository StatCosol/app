import { ControlPreviewDto } from './control-center.dto';
import { ControlInheritDto } from './control-center.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { AutomationControlService } from './control-center.service';
import {
  ControlScopeDto,
  ControlSettingsDto,
  ControlRunDto,
  ControlRetryDto,
  ControlHistoryDto,
} from './control-center.dto';

@ApiTags('Automation Control Centre')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller({ path: 'automation/control-center', version: '1' })
export class AutomationControlController {
  constructor(private readonly controls: AutomationControlService) {}
  private actor(user: ReqUser) {
    const id = user.userId || user.id;
    if (!id) throw new ForbiddenException('User identity required');
    return id;
  }
  @Get() overview() {
    return this.controls.overview();
  }
  @Post('settings') save(
    @Body() q: ControlSettingsDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.controls.save(q, this.actor(user));
  }
  @Post('settings/:id/inherit') inherit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() q: ControlInheritDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.controls.inherit(id, q.version, this.actor(user));
  }
  @Post('preview') preview(@Body() q: ControlPreviewDto) {
    return this.controls.preview(q);
  }
  @Get('runs') history(@Query() q: ControlHistoryDto) {
    return this.controls.history(q.page);
  }
  @Get('changes') changes() {
    return this.controls.changes();
  }
  @Post('runs') run(@Body() q: ControlRunDto, @CurrentUser() user: ReqUser) {
    return this.controls.run(
      q.controlId,
      q.requestId,
      this.actor(user),
      q.previewDigest,
    );
  }
  @Post('runs/:id/retry') retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() q: ControlRetryDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.controls.retry(id, q.requestId, this.actor(user));
  }
}
