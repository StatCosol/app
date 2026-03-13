import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClientsService } from './clients.service';

@Controller({ path: 'clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientsPortalController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async list() {
    const rows = await this.clientsService.listClients(false);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.clientName,
      code: row.clientCode,
      state: row.state ?? null,
      industry: row.industry ?? null,
      isActive: row.status === 'ACTIVE',
      createdAt: row.createdAt ?? null,
    }));
  }

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
    @Req() req: any,
  ) {
    return this.clientsService.create(
      {
        clientName: dto.name,
        clientCode: dto.code,
        state: dto.state,
        industry: dto.industry,
        status: dto.isActive === false ? 'INACTIVE' : 'ACTIVE',
      },
      req.user?.userId,
      req.user?.roleCode,
    );
  }
}
