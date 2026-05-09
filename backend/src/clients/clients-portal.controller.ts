import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientsService } from './clients.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Clients Portal')
@ApiBearerAuth()
@Controller({ path: 'clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientsPortalController {
  constructor(private readonly clientsService: ClientsService) {}

  @ApiOperation({ summary: 'List clients' })
  @Get()
  async list() {
    const rows = await this.clientsService.listClients(false);
    return rows.map((row) => ({
      id: row.id,
      name: row.clientName,
      code: row.clientCode,
      state: row.state ?? null,
      industry: row.industry ?? null,
      isActive: row.status === 'ACTIVE',
      createdAt: row.createdAt ?? null,
    }));
  }

  @ApiOperation({ summary: 'Create client' })
  @Post()
  async create(
    @Body()
    dto: {
      name: string;
      code: string;
      state?: string;
      industry?: string;
      isActive?: boolean;
    },
    @CurrentUser() user: ReqUser,
  ) {
    return this.clientsService.create(
      {
        clientName: dto.name,
        clientCode: dto.code,
        state: dto.state,
        industry: dto.industry,
        status: dto.isActive === false ? 'INACTIVE' : 'ACTIVE',
      },
      user?.userId,
      user?.roleCode,
    );
  }
}
