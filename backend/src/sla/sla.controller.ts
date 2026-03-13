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
import { SlaService } from './sla.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('SLA')
@ApiBearerAuth('JWT')
@Controller({ path: 'sla', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'CCO', 'CEO', 'CRM', 'CLIENT')
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  /**
   * GET /api/v1/sla/tasks?status=...&module=...&branchId=...
   */
  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  async list(
    @Query()
    q: {
      status?: string;
      module?: string;
      branchId?: string;
      clientId?: string;
    },
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;

    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    const clientId = user.clientId || q.clientId;
    if (!clientId) {
      // Admin with no client filter → list all SLA tasks
      return this.slaService.listAll(user, q);
    }

    return this.slaService.list(clientId, user, q);
  }

  /**
   * PATCH /api/v1/sla/tasks/:id
   */
  @ApiOperation({ summary: 'Update' })
  @Patch('tasks/:id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
      assignedToUserId?: string;
      dueDate?: string;
      clientId?: string;
    },
    @Req() req: any,
  ): Promise<any> {
    const user = req.user;

    if (user.roleCode === 'AUDITOR') {
      throw new ForbiddenException('Auditor access denied');
    }

    const clientId = user.clientId || body.clientId;
    if (!clientId) throw new ForbiddenException('Client not mapped');

    return this.slaService.update(clientId, user, id, body);
  }
}
