import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/admin/clients-legacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('list-with-aggregates')
  async listWithAggregates() {
    return this.clientsService.listWithAggregates();
  }
}
