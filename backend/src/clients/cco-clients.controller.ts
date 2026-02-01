import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateClientDto } from './dto/create-client.dto';
import { AssignClientDto } from './dto/assign-client.dto';

@Controller('api/cco/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'ADMIN')
export class CcoClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list() {
    return this.clientsService.listClients();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getClientDetails(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    console.log('[CcoClientsController.create] POST /api/cco/clients', dto);
    return this.clientsService.create(dto);
  }

  @Patch(':id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignClientDto) {
    return this.clientsService.assignCrmAuditor(
      id,
      dto.assignedCrmId,
      dto.assignedAuditorId,
    );
  }
}
