import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchesService } from './branches.service';

@Controller('api/client/branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientBranchesController {
  constructor(private readonly service: BranchesService) {}

  @Get()
  async list(@Req() req: any) {
    const clientId = req.user.clientId;
    return this.service.findByClient(clientId);
  }
}
