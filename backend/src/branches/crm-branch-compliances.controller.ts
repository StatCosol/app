import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchesService } from './branches.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmBranchCompliancesController {
  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceRepo: Repository<ComplianceMasterEntity>,
    @InjectRepository(BranchApplicableComplianceEntity)
    private readonly mappingRepo: Repository<BranchApplicableComplianceEntity>,
    private readonly branchesService: BranchesService,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  // 1. List master compliances
  @ApiOperation({ summary: 'List Master Compliances' })
  @Get('compliances/master')
  async listMasterCompliances() {
    return this.complianceRepo.find({
      select: ['id', 'complianceName'],
      where: { isActive: true },
      order: { complianceName: 'ASC' },
    });
  }

  // 2. Get branch selected compliances
  @ApiOperation({ summary: 'Get Branch Applicable Compliances' })
  @Get('branches/:branchId/applicable-compliances')
  async getBranchApplicableCompliances(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Req() req: any,
  ) {
    const branch = await this.branchesService.findById(branchId);
    const isAssigned = await this.assignmentsService.isClientAssignedToCrm(
      branch.clientId,
      req.user.userId,
    );
    if (!isAssigned) {
      throw new ForbiddenException(
        'Branch client is not assigned to the current CRM user',
      );
    }
    const mappings = await this.mappingRepo.find({
      where: { branchId, isApplicable: true },
      select: ['complianceId'],
    });
    return mappings.map((m) => m.complianceId);
  }

  // 3. Save branch selected compliances
  @ApiOperation({ summary: 'Save Branch Applicable Compliances' })
  @Post('branches/:branchId/applicable-compliances')
  async saveBranchApplicableCompliances(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body('complianceIds') complianceIds: string[],
    @Req() req: any,
  ) {
    const branch = await this.branchesService.findById(branchId);
    const isAssigned = await this.assignmentsService.isClientAssignedToCrm(
      branch.clientId,
      req.user.userId,
    );
    if (!isAssigned) {
      throw new ForbiddenException(
        'Branch client is not assigned to the current CRM user',
      );
    }
    // Remove old
    await this.mappingRepo.delete({ branchId });
    // Insert new
    if (Array.isArray(complianceIds) && complianceIds.length) {
      const mappings = complianceIds.map((complianceId) =>
        this.mappingRepo.create({
          branchId,
          complianceId,
          isApplicable: true,
          createdBy: req.user.userId,
        }),
      );
      await this.mappingRepo.save(mappings);
    }
    return { ok: true };
  }
}
