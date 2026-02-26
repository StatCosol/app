import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EscalationsService } from './escalations.service';

@Controller({ path: 'escalations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class EscalationsController {
  constructor(private readonly escalationsService: EscalationsService) {}

  /**
   * GET /api/v1/escalations?status=...&branchId=...
   */
  @Get()
  async list(
    @Query() q: { status?: string; branchId?: string },
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;

    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    const clientId = user.clientId;
    if (!clientId) throw new ForbiddenException('Client not mapped');

    return this.escalationsService.list(clientId, user, q);
  }

  /**
   * PATCH /api/v1/escalations/:id
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { status?: string },
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;

    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    const clientId = user.clientId;
    if (!clientId) throw new ForbiddenException('Client not mapped');

    return this.escalationsService.update(clientId, user, id, body);
  }
}
