import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReqUser } from '../access/access-scope.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
  async myBranches(@CurrentUser() user: ReqUser) {
    return this.assignmentsService.getAssignedBranchesForAuditor(user.userId);
  }
}
