import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompliancesService } from '../compliances/compliances.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BranchesController {
  constructor(
    private readonly service: BranchesService,
    private readonly compliancesService: CompliancesService,
  ) {}

  @Post('clients/:clientId/branches')
  create(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: any,
    @Req() req: any,
  ) {
    return this.service.create(
      clientId,
      dto,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @Get('clients/:clientId/branches')
  findByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.service.findByClient(clientId, includeDeleted === 'true');
  }

  @Get('branches/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.service.findById(id, includeDeleted === 'true');
  }

  @Put('branches/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
    @Query('recomputeCompliances') recomputeCompliances?: string,
  ) {
    return this.service.update(id, dto).then(async (updated) => {
      const shouldRecompute = recomputeCompliances !== 'false';
      if (shouldRecompute) {
        await this.compliancesService.recomputeBranchComplianceApplicability(
          id,
        );
      }
      return { ok: true, branch: updated, recomputed: shouldRecompute };
    });
  }

  @Delete('branches/:id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string | null,
    @Req() req: any,
  ) {
    return this.service.delete(
      id,
      req.user?.userId,
      req.user?.roleCode,
      reason ?? null,
    );
  }

  @Post('branches/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.restore(id, req.user?.userId, req.user?.roleCode);
  }

  // ---- Contractors per branch ----

  @Get('branches/:id/contractors')
  listContractors(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listContractors(id);
  }

  @Post('branches/:id/contractors')
  addContractor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.addContractor(id, userId);
  }

  @Delete('branches/:branchId/contractors/:userId')
  removeContractor(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.removeContractor(branchId, userId);
  }

  // --- Admin: List all applicable compliances for a branch ---
  @Get('branches/:id/applicable-compliances')
  async listApplicableCompliances(@Param('id', ParseUUIDPipe) branchId: string) {
    // Return all compliance mappings for this branch
    // (Admin can see all, regardless of CRM assignment)
    return this.service.listApplicableCompliances(branchId);
  }

  // --- Admin: Save applicable compliances for a branch ---
  @Post('branches/:id/applicable-compliances')
  async saveApplicableCompliances(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body('complianceIds') complianceIds: string[],
    @Req() req: any,
  ) {
    return this.service.saveApplicableCompliances(branchId, complianceIds, req.user?.userId);
  }
}
