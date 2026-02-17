import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CrmContractorRegistrationService } from './crm-contractor-registration.service';
import {
  ClientScoped,
  CrmAssignmentGuard,
} from '../assignments/crm-assignment.guard';

@Controller({ path: 'crm/contractors', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmContractorRegistrationController {
  constructor(private readonly service: CrmContractorRegistrationService) {}

  @Post('register')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  async registerContractor(
    @Req() req: any,
    @Body()
    dto: {
      name: string;
      email: string;
      mobile?: string;
      password: string;
      clientId: string;
      branchIds?: string[];
    },
  ) {
    if (!dto.name || !dto.email || !dto.password || !dto.clientId) {
      throw new BadRequestException(
        'name, email, password, and clientId are required',
      );
    }

    return this.service.registerContractor(req.user, dto);
  }

  @Get('my-contractors')
  async listMyContractors(@Req() req: any) {
    return this.service.listContractorsForCrm(req.user);
  }
}
