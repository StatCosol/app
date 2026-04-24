import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller({ path: 'approvals', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'CEO')
export class ApprovalsController {
  constructor(private readonly usersService: UsersService) {}

  // Pending deletion approvals for the logged-in approver (CCO/CEO)
  @ApiOperation({ summary: 'Get pending deletion approvals' })
  @Get('pending')
  async getPending(@CurrentUser() user: ReqUser) {
    return this.usersService.listPendingDeletionRequestsForApprover(
      user.userId,
      user.roleCode,
    );
  }

  // Approve a specific deletion request
  @ApiOperation({ summary: 'Approve a deletion request' })
  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.usersService.approveDeletionRequest(
      id,
      user.userId,
      user.roleCode,
    );
  }

  // Reject a specific deletion request
  @ApiOperation({ summary: 'Reject a deletion request' })
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { remarks?: string },
    @CurrentUser() user: ReqUser,
  ) {
    return this.usersService.rejectDeletionRequest(
      id,
      user.userId,
      user.roleCode,
      body?.remarks || '',
    );
  }
}
