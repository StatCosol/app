import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorService } from './contractor.service';

@Controller('api/contractor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorController {
  constructor(private readonly service: ContractorService) {}

  @Get('dashboard')
  getDashboard(@Req() req: any) {
    const userId = req.user?.userId;
    return this.service.getDashboard(userId);
  }
}

@Controller('api/admin/contractors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminContractorsController {
  constructor(private readonly service: ContractorService) {}

  @Get('links')
  listLinks() {
    return this.service.listContractorLinks();
  }
}

@Controller('api/crm/contractors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmContractorsController {
  constructor(private readonly service: ContractorService) {}

  @Get(':contractorId/branches')
  getContractorBranches(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
  ) {
    const userId = req.user?.userId;
    return this.service.getContractorBranchesForCrm(userId, contractorId);
  }

  @Put(':contractorId/branches')
  setContractorBranches(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Body() dto: { branchIds: string[] },
  ) {
    const userId = req.user?.userId;
    return this.service.setContractorBranchesForCrm(
      userId,
      contractorId,
      dto.branchIds,
    );
  }

  @Post(':contractorId/branches')
  addContractorBranches(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Body() dto: { branchIds: string[] },
  ) {
    const userId = req.user?.userId;
    return this.service.addContractorBranchesForCrm(
      userId,
      contractorId,
      dto.branchIds,
    );
  }

  @Delete(':contractorId/branches/:branchId')
  removeContractorBranch(
    @Req() req: any,
    @Param('contractorId') contractorId: string,
    @Param('branchId') branchId: string,
  ) {
    const userId = req.user?.userId;
    return this.service.removeContractorBranchForCrm(
      userId,
      contractorId,
      branchId,
    );
  }
}
