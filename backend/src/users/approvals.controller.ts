import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'CEO')
export class ApprovalsController {
  constructor(private readonly usersService: UsersService) {}

  // Pending deletion approvals for the logged-in approver (CCO/CEO)
  @Get('pending')
  async getPending(@Req() req: any) {
    const user = req.user;
    return this.usersService.listPendingDeletionRequestsForApprover(
      user.userId,
      user.roleCode,
    );
  }

  // Approve a specific deletion request
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    return this.usersService.approveDeletionRequest(
      id,
      user.userId,
      user.roleCode,
    );
  }

  // Reject a specific deletion request
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { remarks?: string },
    @Req() req: any,
  ) {
    const user = req.user;
    return this.usersService.rejectDeletionRequest(
      id,
      user.userId,
      user.roleCode,
      body?.remarks || '',
    );
  }
}
