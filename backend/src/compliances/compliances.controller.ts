import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CompliancesService } from './compliances.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CompliancesController {
  constructor(private readonly service: CompliancesService) {}

  @ApiOperation({ summary: 'Find All' })
  @Get('compliances')
  findAll() {
    return this.service.findAll();
  }

  @ApiOperation({ summary: 'Get Branch Compliances' })
  @Get('branches/:branchId/compliances')
  getBranchCompliances(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.service.getBranchCompliances(branchId);
  }

  @ApiOperation({ summary: 'Save Branch Compliances' })
  @Post('branches/:branchId/compliances')
  saveBranchCompliances(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: { clientId: string; complianceIds: string[] },
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.saveBranchCompliances(
      branchId,
      dto.clientId,
      dto.complianceIds,
      user.userId,
    );
  }

  @ApiOperation({ summary: 'Recompute' })
  @Post('branches/:branchId/compliances/recompute')
  recompute(@Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.service.recomputeBranchComplianceApplicability(branchId);
  }
}
