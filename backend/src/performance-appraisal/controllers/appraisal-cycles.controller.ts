import { UseGuards } from '@nestjs/common';
import { AppraisalScopeGuard, appraisalFilter } from '../appraisal-scope.guard';
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { AppraisalCyclesService } from '../services/appraisal-cycles.service';
import {
  CreateAppraisalCycleDto,
  UpdateAppraisalCycleDto,
} from '../dto/appraisal-cycle.dto';

@UseGuards(AppraisalScopeGuard)
@ApiTags('Appraisal Cycles')
@ApiBearerAuth('JWT')
@Controller({ path: 'appraisal/cycles', version: '1' })
export class AppraisalCyclesController {
  constructor(private readonly cyclesService: AppraisalCyclesService) {}

  @Post()
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Create appraisal cycle' })
  create(@Body() dto: CreateAppraisalCycleDto, @CurrentUser() user: ReqUser) {
    return this.cyclesService.create(user.clientId!, dto, user.id);
  }

  @Get()
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'List appraisal cycles' })
  findAll(@CurrentUser() user: ReqUser, @Query('branchId') branchId?: string) {
    const scope = appraisalFilter(user, { branchId });
    return this.cyclesService.findAll(scope.clientId!, scope.branchId);
  }

  @Get(':id')
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'Get appraisal cycle details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cyclesService.findOne(id);
  }

  @Put(':id')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Update appraisal cycle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppraisalCycleDto,
  ) {
    return this.cyclesService.update(id, dto);
  }

  @Post(':id/activate')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Activate appraisal cycle' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.cyclesService.activate(id);
  }

  @Post(':id/close')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Close appraisal cycle' })
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.cyclesService.close(id);
  }

  @Post(':id/generate')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Generate employee appraisals for cycle' })
  generate(@Param('id', ParseUUIDPipe) id: string) {
    return this.cyclesService.generateEmployees(id);
  }
}
