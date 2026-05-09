import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NominationsService } from './nominations.service';
import { SaveNominationDto } from './dto/save-nomination.dto';
import { GenerateFormDto } from './dto/generate-form.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Nominations')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/nominations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class NominationsController {
  constructor(private readonly service: NominationsService) {}

  private toCtx(user: ReqUser) {
    return {
      userId: user.userId,
      clientId: user.clientId!,
      roleCode: user.roleCode,
      branchId: user.branchIds?.[0] ?? null,
    };
  }

  @ApiOperation({ summary: 'Save' })
  @Post('save')
  save(@CurrentUser() user: ReqUser, @Body() dto: SaveNominationDto) {
    return this.service.saveNomination(this.toCtx(user), dto);
  }

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(
    @CurrentUser() user: ReqUser,
    @Query('employeeId') employeeId: string,
    @Query('type') type: string,
  ) {
    return this.service.getNomination(this.toCtx(user), employeeId, type);
  }

  @ApiOperation({ summary: 'List All' })
  @Get('all')
  listAll(
    @CurrentUser() user: ReqUser,
    @Query('employeeId') employeeId: string,
  ) {
    return this.service.listNominations(this.toCtx(user), employeeId);
  }

  @ApiOperation({ summary: 'List Forms' })
  @Get('forms')
  listForms(
    @CurrentUser() user: ReqUser,
    @Query('employeeId') employeeId: string,
  ) {
    return this.service.listForms(this.toCtx(user), employeeId);
  }

  @ApiOperation({ summary: 'Generate' })
  @Post('generate')
  generate(@CurrentUser() user: ReqUser, @Body() dto: GenerateFormDto) {
    return this.service.generateForm(this.toCtx(user), dto);
  }
}
