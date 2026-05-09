import {
  Body,
  BadRequestException,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CCO', 'ADMIN')
export class CcoClientsController {
  private readonly logger = new Logger(CcoClientsController.name);
  constructor(private readonly clientsService: ClientsService) {}

  private isAdmin(user: ReqUser): boolean {
    return (user?.roleCode ?? '').toUpperCase() === 'ADMIN';
  }

  private ccoIdOrNull(user: ReqUser): string | null {
    if (this.isAdmin(user)) return null;
    return user?.userId ?? user?.id ?? null;
  }

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser) {
    return this.clientsService.listClients(false, this.ccoIdOrNull(user));
  }

  @ApiOperation({ summary: 'Get' })
  @Get(':id')
  async get(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ccoId = this.ccoIdOrNull(user);
    if (ccoId) await this.clientsService.assertClientOwnedByCco(id, ccoId);
    return this.clientsService.getClientDetails(id);
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  async create(@CurrentUser() user: ReqUser, @Body() dto: CreateClientDto) {
    this.logger.log('POST /api/cco/clients', dto);
    const ccoId = this.ccoIdOrNull(user);
    if (ccoId) {
      if (!dto.assignedCrmId) {
        throw new BadRequestException(
          'assignedCrmId is required for CCO client creation',
        );
      }
      await this.clientsService.assertUserOwnedByCco(
        dto.assignedCrmId,
        ccoId,
        'CRM',
      );
      if (dto.assignedAuditorId) {
        await this.clientsService.assertUserOwnedByCco(
          dto.assignedAuditorId,
          ccoId,
          'AUDITOR',
        );
      }
    }
    return this.clientsService.create(dto, user.userId ?? user.id, user.roleCode);
  }

  @ApiOperation({ summary: 'Assign' })
  @Patch(':id/assign')
  async assign(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignClientDto,
  ) {
    const ccoId = this.ccoIdOrNull(user);
    if (ccoId) {
      await this.clientsService.assertClientOwnedByCco(id, ccoId);
      // Also confirm the CRM/auditor being assigned is owned by this CCO.
      if (dto.assignedCrmId) {
        await this.clientsService.assertUserOwnedByCco(
          dto.assignedCrmId,
          ccoId,
          'CRM',
        );
      }
      if (dto.assignedAuditorId) {
        await this.clientsService.assertUserOwnedByCco(
          dto.assignedAuditorId,
          ccoId,
          'AUDITOR',
        );
      }
    }
    return this.clientsService.assignCrmAuditor(
      id,
      dto.assignedCrmId,
      dto.assignedAuditorId,
    );
  }
}
