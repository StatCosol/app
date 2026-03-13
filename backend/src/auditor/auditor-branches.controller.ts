import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AssignmentsService } from '../assignments/assignments.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Auditor')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorBranchesController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @ApiOperation({ summary: 'My Branches' })
  @Get('branches')
  async myBranches(@Request() req) {
    return this.assignmentsService.getAssignedBranchesForAuditor(
      req.user.userId,
    );
  }
}
