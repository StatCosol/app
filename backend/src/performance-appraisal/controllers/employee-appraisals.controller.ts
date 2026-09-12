import { UseGuards } from '@nestjs/common';
import {
  AppraisalScopeGuard,
  appraisalFilter,
  isAppraisalBranch,
} from '../appraisal-scope.guard';
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { EmployeeAppraisalsService } from '../services/employee-appraisals.service';
import {
  ManagerReviewDto,
  BranchReviewDto,
  ClientApproveDto,
  AppraisalFilterDto,
} from '../dto/employee-appraisal.dto';

@UseGuards(AppraisalScopeGuard)
@ApiTags('Employee Appraisals')
@ApiBearerAuth('JWT')
@Controller({ path: 'appraisal/employees', version: '1' })
export class EmployeeAppraisalsController {
  constructor(private readonly appraisalsService: EmployeeAppraisalsService) {}

  @Get()
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'List employee appraisals with filters' })
  findAll(@Query() filter: AppraisalFilterDto, @CurrentUser() user: ReqUser) {
    return this.appraisalsService.findAll({
      ...filter,
      ...appraisalFilter(user, filter),
    });
  }

  @Get('dashboard')
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'Appraisal dashboard summary' })
  dashboard(
    @CurrentUser() user: ReqUser,
    @Query('branchId') branchId?: string,
  ) {
    const scope = appraisalFilter(user, { branchId });
    return this.appraisalsService.getDashboard(
      scope.clientId!,
      scope.branchId,
      scope.branchIds,
    );
  }

  @Get(':id')
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'Get single employee appraisal' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appraisalsService.findOne(id);
  }

  @Get(':id/history')
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'Get appraisal audit history' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.appraisalsService.getHistory(id);
  }

  @Post(':id/manager-review')
  @Roles('BRANCH_DESK')
  @ApiOperation({ summary: 'Manager review of employee appraisal' })
  managerReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManagerReviewDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.appraisalsService.managerReview(id, dto, user.id);
  }

  @Post(':id/branch-review')
  @Roles('BRANCH_DESK')
  @ApiOperation({ summary: 'Branch-level review of employee appraisal' })
  branchReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BranchReviewDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.appraisalsService.branchReview(id, dto, user.id);
  }

  @Post(':id/client-approve')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Client approve/reject/send-back appraisal' })
  clientApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClientApproveDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.appraisalsService.clientApprove(id, dto, user.id);
  }

  @Post(':id/send-back')
  @Roles('CLIENT', 'ADMIN', 'BRANCH_DESK')
  @ApiOperation({ summary: 'Send back appraisal for re-review' })
  sendBack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('remarks') remarks: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.appraisalsService.sendBack(
      id,
      remarks,
      user.id,
      !isAppraisalBranch(user) && ['CLIENT', 'ADMIN'].includes(user.roleCode)
        ? 'CLIENT'
        : 'BRANCH',
    );
  }

  @Post(':id/lock')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Lock finalized appraisal' })
  lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: ReqUser) {
    return this.appraisalsService.lock(id, user.id);
  }
}
