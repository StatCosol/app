import {
  Controller,
  Get,
  Req,
  UseGuards,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersService } from '../users/users.service';

@Controller('api/ceo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CEO')
export class CeoController {
  constructor(
    @InjectRepository(ApprovalEntity)
    private readonly approvalRepo: Repository<ApprovalEntity>,
    private readonly usersService: UsersService,
  ) {}

  @Get('dashboard')
  async dashboard(@Req() req: any) {
    // IMPORTANT: your JwtStrategy returns userId (not id)
    const ceoUserId = req.user.userId;

    const pendingApprovals = await this.approvalRepo.count({
      where: { status: 'PENDING', requestedTo: { id: ceoUserId } as any },
    });

    // keep others as 0 for now (until escalations/compliance tables wired)
    return {
      pendingApprovals,
      escalations: 0,
      overdue: 0,
      compliancePending: 0,
    };
  }

  @Get('approvals')
  async approvals(@Req() req: any) {
    const user = req.user;
    return this.usersService.listPendingDeletionRequestsForApprover(
      user.userId,
      user.roleCode,
    );
  }

  @Get('approvals/:id')
  async approval(@Param('id') id: string) {
    const approval = await this.approvalRepo.findOne({
      where: { id: Number(id) },
      relations: ['requestedBy', 'requestedTo'],
    });

    if (approval) {
      return approval;
    }

    // Fallback stub to keep UI from failing if no record exists
    return { id: Number(id), status: 'PENDING', note: 'No approval found' };
  }

  @Post('approvals/:id/approve')
  async approve(@Param('id') id: string, @Req() req: any) {
    const user = req.user;
    return this.usersService.approveDeletionRequest(
      id,
      user.userId,
      user.roleCode,
    );
  }

  @Post('approvals/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { remarks?: string; reason?: string },
    @Req() req: any,
  ) {
    const user = req.user;
    const remarks = body?.remarks || body?.reason || '';
    return this.usersService.rejectDeletionRequest(
      id,
      user.userId,
      user.roleCode,
      remarks,
    );
  }

  // ---- Stubs for CEO escalations / oversight / notifications ----

  @Get('escalations')
  async escalations(@Query() query: any) {
    return { items: [], total: 0, query };
  }

  @Get('escalations/:id')
  async escalation(@Param('id') id: string) {
    return { id: Number(id), status: 'OPEN', comments: [] };
  }

  @Post('escalations/:id/comment')
  async escalationComment(
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    return { id: Number(id), message: body?.message ?? '' };
  }

  @Post('escalations/:id/assign-to-cco')
  async escalationAssign(
    @Param('id') id: string,
    @Body() body: { ccoId: number; note?: string },
  ) {
    return {
      id: Number(id),
      assignedTo: body?.ccoId ?? null,
      note: body?.note ?? '',
    };
  }

  @Post('escalations/:id/close')
  async escalationClose(
    @Param('id') id: string,
    @Body() body: { resolutionNote?: string },
  ) {
    return {
      id: Number(id),
      status: 'CLOSED',
      resolutionNote: body?.resolutionNote ?? '',
    };
  }

  @Get('oversight/cco-summary')
  async oversightSummary() {
    return { ccoSummary: [] };
  }

  @Get('oversight/cco/:ccoId/items')
  async oversightItems(
    @Param('ccoId') ccoId: string,
    @Query('status') status?: string,
  ) {
    return { ccoId, status: status ?? 'OPEN', items: [] };
  }

  @Get('notifications')
  async notifications() {
    return [];
  }

  @Post('notifications/:id/read')
  async markNotificationRead(@Param('id') id: string) {
    return { id: Number(id), read: true };
  }
}
