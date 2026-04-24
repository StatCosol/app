import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Contractor')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/contractors', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmContractorRegistrationController {
  constructor(private readonly service: CrmContractorRegistrationService) {}

  @ApiOperation({ summary: 'Register Contractor' })
  @Post('register')
  @ClientScoped('clientId')
  @UseGuards(CrmAssignmentGuard)
  async registerContractor(
    @CurrentUser() user: ReqUser,
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

    return this.service.registerContractor(user, dto);
  }

  @ApiOperation({ summary: 'List My Contractors' })
  @Get('my-contractors')
  async listMyContractors(@CurrentUser() user: ReqUser) {
    return this.service.listContractorsForCrm(user);
  }
}
