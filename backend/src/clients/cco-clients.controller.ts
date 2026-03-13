import {
  Body,
  Controller,
  Get,
  Logger,
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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'ADMIN')
export class CcoClientsController {
  private readonly logger = new Logger(CcoClientsController.name);
  constructor(private readonly clientsService: ClientsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list() {
    return this.clientsService.listClients();
  }

  @ApiOperation({ summary: 'Get' })
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getClientDetails(id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  create(@Body() dto: CreateClientDto) {
    this.logger.log('POST /api/cco/clients', dto);
    return this.clientsService.create(dto);
  }

  @ApiOperation({ summary: 'Assign' })
  @Patch(':id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignClientDto) {
    return this.clientsService.assignCrmAuditor(
      id,
      dto.assignedCrmId,
      dto.assignedAuditorId,
    );
  }
}
