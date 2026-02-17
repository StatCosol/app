import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from '../users/users.service';
import { ClientsService } from '../clients/clients.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

@Controller({ path: 'client', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientController {
  constructor(
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
  ) {}

  @Get('me')
  async getMyCompany(@Request() req) {
    const userId = req.user.userId;
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.clientId) {
      throw new BadRequestException('User is not linked to any client company');
    }

    const client = await this.clientsService.findById(user.clientId);
    if (!client) {
      throw new NotFoundException('Client company not found');
    }

    return {
      clientId: client.id,
      clientName: client.clientName,
    };
  }
}
