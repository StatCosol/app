import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminApprovalsService } from './admin-approvals.service';

@Controller({ path: 'admin/approvals', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminApprovalsController {
  constructor(private readonly approvalsService: AdminApprovalsService) {}

  @Get()
  async list(@Query('status') status?: string) {
    return this.approvalsService.list(status);
  }

  @Get('counts')
  async getCounts() {
    return this.approvalsService.getCounts();
  }

  @Post(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @Req() req: any,
  ) {
    const approverId = req.user?.userId ?? req.user?.id;
    return this.approvalsService.approve(id, approverId, notes);
  }

  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @Req() req: any,
  ) {
    const approverId = req.user?.userId ?? req.user?.id;
    return this.approvalsService.reject(id, approverId, notes);
  }
}
