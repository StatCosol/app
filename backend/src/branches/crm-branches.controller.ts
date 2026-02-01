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

@Controller('api/crm')
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

  @Get('clients/:clientId/branches')
  async listByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Request() req,
  ) {
    await this.ensureClientAssigned(clientId, req.user.userId);
    return this.branchesService.findByClient(clientId);
  }

  @Post('clients/:clientId/branches')
  async createBranch(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: any,
    @Request() req,
  ) {
    await this.ensureClientAssigned(clientId, req.user.userId);
    return this.branchesService.create(
      clientId,
      dto,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  // ---- Branch compliances (CRM-scoped, read-only) ----

  @Get('branches/:id/compliances')
  async listCompliances(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.compliancesService.getBranchComplianceSummaries(id);
  }

  // ---- Branch edit/delete ----

  @Patch('branches/:id')
  async updateBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.update(id, dto);
  }

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

  @Get('branches/:id/contractors')
  async listContractors(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.listContractors(id);
  }

  @Post('branches/:id/contractors')
  async addContractor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
    @Request() req,
  ) {
    await this.ensureBranchAssigned(id, req.user.userId);
    return this.branchesService.addContractor(id, userId);
  }

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
