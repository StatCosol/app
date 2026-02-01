import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateClientDto } from './dto/create-client.dto';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('clients')
  list(@Query('includeDeleted') includeDeleted?: string) {
    const include = includeDeleted === 'true';
    return this.clientsService.listClients(include);
  }

  @Get('clients/with-aggregates')
  listWithAggregates(@Query('includeDeleted') includeDeleted?: string) {
    const include = includeDeleted === 'true';
    return this.clientsService.listClients(include);
  }

  @Get('clients/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const include = includeDeleted === 'true';
    return this.clientsService.findById(id, include);
  }

  @Post('clients')
  create(@Body() dto: CreateClientDto, @Req() req: any) {
    const fallbackCode =
      dto.clientName
        ?.split(' ')
        .filter((word) => word.trim().length > 0)
        .map((word) => word[0]?.toUpperCase())
        .join('') || 'CLI';

    const payload: CreateClientDto = {
      ...dto,
      clientCode: dto.clientCode?.trim() || fallbackCode,
    };

    return this.clientsService.create(
      payload,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @Delete('clients/:id')
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body('reason') reason?: string,
  ) {
    return this.clientsService.softDelete(
      id,
      req.user?.userId,
      req.user?.roleCode,
      reason ?? null,
    );
  }

  @Post('clients/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.clientsService.restore(
      id,
      req.user?.userId,
      req.user?.roleCode,
    );
  }

  @Get('client-users-with-client')
  listClientUsersWithClient() {
    return this.clientsService.listClientUsersWithClient();
  }

  @Get('clients/:id/users')
  listClientUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.listClientUsers(id);
  }

  @Post('clients/:id/users')
  addClientUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clientsService.addClientUser(id, userId);
  }

  @Delete('clients/:clientId/users/:userId')
  removeClientUser(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.clientsService.removeClientUser(clientId, userId);
  }
}
