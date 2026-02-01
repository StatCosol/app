import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BranchesService } from '../branches/branches.service';
import { UsersService } from '../users/users.service';

@Controller('api/client/contractors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientContractorsController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async list(@Req() req: any) {
    const clientId = req.user.clientId;
    // Get all branches for this client
    const branches = await this.branchesService.findByClient(clientId);
    const branchIds = branches.map((b) => b.id);
    // Get all contractors linked to these branches
    const contractors =
      await this.usersService.findContractorsByBranchIds(branchIds);
    return contractors;
  }
}
