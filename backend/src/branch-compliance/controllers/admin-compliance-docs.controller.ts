import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import {
  CreateReturnMasterDto,
  UpdateReturnMasterDto,
  ReturnMasterQueryDto,
} from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/branch-compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** List all return master entries */
  @ApiOperation({ summary: 'List Master' })
  @Get('return-master')
  listMaster(@Query() q: ReturnMasterQueryDto) {
    return this.svc.getReturnMaster(q);
  }

  /** Create a new return master entry */
  @ApiOperation({ summary: 'Create Master' })
  @Post('return-master')
  createMaster(@Body() dto: CreateReturnMasterDto) {
    return this.svc.createReturnMaster(dto);
  }

  /** Update a return master entry */
  @ApiOperation({ summary: 'Update Master' })
  @Patch('return-master/:returnCode')
  updateMaster(
    @Param('returnCode') returnCode: string,
    @Body() dto: UpdateReturnMasterDto,
  ) {
    return this.svc.updateReturnMaster(returnCode, dto);
  }
}
