import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
  Patch,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
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

  private async ensureClientAssigned(clientId: string, userId: string) {
    const isAssigned = await this.assignmentsService.isClientAssignedToCrm(
      clientId,
      userId,
    );
    if (!isAssigned) {
      throw new ForbiddenException(
        'Client is not assigned to the current CRM user',
      );
    }
  }

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
    @Request() req,
  ) {
    return this.branchesService.findByClient(clientId);
  }

  @ApiOperation({ summary: 'Create Branch' })
  @Post('clients/:clientId/branches')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  async createBranch(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: any,
    @Request() req,
  ) {
    return this.branchesService.create(
      clientId,
      dto,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  // ---- Branch compliances (CRM-scoped, read-only) ----

  @ApiOperation({ summary: 'List Compliances' })
  @Get('branches/:id/compliances')
  async listCompliances(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.compliancesService.getBranchCompliances(id);
  }

  @ApiOperation({ summary: 'Save Compliances' })
  @Post('branches/:id/compliances')
  async saveCompliances(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { complianceIds: string[] },
    @Request() req,
  ) {
    const branch = await this.ensureBranchAssigned(id, req.user.userId);
    return this.compliancesService.saveBranchCompliances(
      id,
      branch.clientId,
      body.complianceIds ?? [],
      req.user.userId,
    );
  }

  // ---- Branch edit/delete ----

  @ApiOperation({ summary: 'Update Branch' })
  @Patch('branches/:id')
  async updateBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete Branch' })
  @Delete('branches/:id')
  async deleteBranch(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.delete(
      id,
      req.user?.userId,
      req.user?.roleCode,
      'CRM delete',
    );
  }

  // ---- Contractors per branch (CRM-scoped) ----

  @ApiOperation({ summary: 'List Contractors' })
  @Get('branches/:id/contractors')
  async listContractors(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.listContractors(id);
  }

  @ApiOperation({ summary: 'Add Contractor' })
  @Post('branches/:id/contractors')
  async addContractor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.addContractor(id, userId);
  }

  @ApiOperation({ summary: 'Remove Contractor' })
  @Delete('branches/:branchId/contractors/:userId')
  async removeContractor(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(branchId, req.user.userId);
    return this.branchesService.removeContractor(branchId, userId);
  }
}
