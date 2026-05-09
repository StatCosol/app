import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ForbiddenException,
  Patch,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AssignmentsService } from '../assignments/assignments.service';
import { CompliancesService } from '../compliances/compliances.service';
import {
  ClientScoped,
  CrmAssignmentGuard,
} from '../assignments/crm-assignment.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmBranchesController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly assignmentsService: AssignmentsService,
    private readonly compliancesService: CompliancesService,
  ) {}

  private async ensureBranchAssigned(branchId: string, userId: string) {
    const branch = await this.branchesService.findById(branchId);
    const isAssigned = await this.assignmentsService.isClientAssignedToCrm(
      branch.clientId,
      userId,
    );

    if (!isAssigned) {
      throw new ForbiddenException(
        'Branch client is not assigned to the current CRM user',
      );
    }

    return branch;
  }

  @ApiOperation({ summary: 'List By Client' })
  @Get('clients/:clientId/branches')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  async listByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() _user: ReqUser,
  ) {
    return this.branchesService.findByClient(clientId);
  }

  @ApiOperation({ summary: 'Create Branch' })
  @Post('clients/:clientId/branches')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  async createBranch(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.branchesService.create(
      clientId,
      dto,
      user?.userId,
      user?.roleCode,
    );
  }

  // ---- Branch compliances (CRM-scoped, read-only) ----

  @ApiOperation({ summary: 'List Compliances' })
  @Get('branches/:id/compliances')
  async listCompliances(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureBranchAssigned(id, user.userId);
    return this.compliancesService.getBranchCompliances(id);
  }

  @ApiOperation({ summary: 'Save Compliances' })
  @Post('branches/:id/compliances')
  async saveCompliances(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { complianceIds: string[] },
    @CurrentUser() user: ReqUser,
  ) {
    const branch = await this.ensureBranchAssigned(id, user.userId);
    return this.compliancesService.saveBranchCompliances(
      id,
      branch.clientId,
      body.complianceIds ?? [],
      user.userId,
    );
  }

  // ---- Branch edit/delete ----

  @ApiOperation({ summary: 'Update Branch' })
  @Patch('branches/:id')
  async updateBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureBranchAssigned(id, user.userId);
    return this.branchesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete Branch' })
  @Delete('branches/:id')
  async deleteBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureBranchAssigned(id, user.userId);
    return this.branchesService.delete(
      id,
      user?.userId,
      user?.roleCode,
      'CRM delete',
    );
  }

  // ---- Contractors per branch (CRM-scoped) ----

  @ApiOperation({ summary: 'List Contractors' })
  @Get('branches/:id/contractors')
  async listContractors(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureBranchAssigned(id, user.userId);
    return this.branchesService.listContractors(id);
  }

  @ApiOperation({ summary: 'Add Contractor' })
  @Post('branches/:id/contractors')
  async addContractor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureBranchAssigned(id, user.userId);
    return this.branchesService.addContractor(id, userId);
  }

  @ApiOperation({ summary: 'Remove Contractor' })
  @Delete('branches/:branchId/contractors/:userId')
  async removeContractor(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.ensureBranchAssigned(branchId, user.userId);
    return this.branchesService.removeContractor(branchId, userId);
  }
}
