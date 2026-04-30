import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompliancesService } from '../compliances/compliances.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BranchesController {
  constructor(
    private readonly service: BranchesService,
    private readonly _compliancesService: CompliancesService,
  ) {}

  @ApiOperation({ summary: 'Create' })
  @Post('clients/:clientId/branches')
  create(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.create(clientId, dto, user?.userId, user?.roleCode);
  }

  @ApiOperation({ summary: 'Find By Client' })
  @Get('clients/:clientId/branches')
  findByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.service.findByClient(clientId, includeDeleted === 'true');
  }

  @ApiOperation({ summary: 'Find One' })
  @Get('branches/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.service.findById(id, includeDeleted === 'true');
  }

  @ApiOperation({ summary: 'Update' })
  @Put('branches/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBranchDto) {
    // recomputeForBranch() is already called inside service.update(),
    // so we do NOT call recomputeBranchComplianceApplicability here.
    return this.service.update(id, dto).then((updated) => {
      return { ok: true, branch: updated };
    });
  }

  @ApiOperation({ summary: 'Delete' })
  @Delete('branches/:id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string | null,
    @Query('mode') mode: string | undefined,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.delete(
      id,
      user?.userId,
      user?.roleCode,
      reason ?? null,
      mode === 'force' ? 'force' : 'request',
    );
  }

  @ApiOperation({ summary: 'Restore' })
  @Post('branches/:id/restore')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.restore(id, user?.userId, user?.roleCode);
  }

  // ---- Contractors per branch ----

  @ApiOperation({ summary: 'List Contractors' })
  @Get('branches/:id/contractors')
  listContractors(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listContractors(id);
  }

  @ApiOperation({ summary: 'Add Contractor' })
  @Post('branches/:id/contractors')
  addContractor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.addContractor(id, userId);
  }

  @ApiOperation({ summary: 'Remove Contractor' })
  @Delete('branches/:branchId/contractors/:userId')
  removeContractor(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.removeContractor(branchId, userId);
  }

  // --- Admin: List all applicable compliances for a branch ---
  @ApiOperation({ summary: 'List Applicable Compliances' })
  @Get('branches/:id/applicable-compliances')
  async listApplicableCompliances(
    @Param('id', ParseUUIDPipe) branchId: string,
  ) {
    // Return all compliance mappings for this branch
    // (Admin can see all, regardless of CRM assignment)
    return this.service.listApplicableCompliances(branchId);
  }

  // --- Admin: Save applicable compliances for a branch ---
  @ApiOperation({ summary: 'Save Applicable Compliances' })
  @Post('branches/:id/applicable-compliances')
  async saveApplicableCompliances(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body('complianceIds') complianceIds: string[],
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.saveApplicableCompliances(
      branchId,
      complianceIds,
      user?.userId,
    );
  }
}
