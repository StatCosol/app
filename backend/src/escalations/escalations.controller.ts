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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Escalations')
@ApiBearerAuth('JWT')
@Controller({ path: 'escalations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class EscalationsController {
  constructor(private readonly escalationsService: EscalationsService) {}

  /**
   * GET /api/v1/escalations?status=...&branchId=...
   */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @Query() q: { status?: string; branchId?: string; clientId?: string },
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;

    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    // Admin roles may not have a clientId — accept as query param or list all
    const clientId = user.clientId || q.clientId;
    if (!clientId) {
      // Admin with no client filter → list all escalations
      return this.escalationsService.listAll(user, q);
    }

    return this.escalationsService.list(clientId, user, q);
  }

  /**
   * PATCH /api/v1/escalations/:id
   */
  @ApiOperation({ summary: 'Update' })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { status?: string; clientId?: string },
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;

    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    const clientId = user.clientId || body.clientId;
    if (!clientId) throw new ForbiddenException('Client not mapped');

    return this.escalationsService.update(clientId, user, id, body);
  }
}
