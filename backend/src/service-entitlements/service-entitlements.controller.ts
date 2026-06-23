import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from './service-entitlements.service';
import {
  CreateModuleChangeRequestDto,
  ReviewModuleChangeRequestDto,
} from './dto/service-entitlements.dto';

@ApiTags('Service Entitlements')
@ApiBearerAuth('JWT')
@Controller({ path: 'service-entitlements', version: '1' })
export class ServiceEntitlementsController {
  constructor(private readonly service: ServiceEntitlementsService) {}

  @Get('packages')
  @ApiOperation({ summary: 'List available client service packages' })
  listPackages() {
    return this.service.listPackageOptions();
  }

  @Get('modules')
  @ApiOperation({ summary: 'List selectable client service modules' })
  listModules() {
    return this.service.listModuleOptions();
  }

  @Get('clients/:clientId')
  @Roles('ADMIN', 'CCO')
  @ApiOperation({ summary: 'Get active service package for one client' })
  getClientStatus(@Param('clientId') clientId: string) {
    return this.service.getClientStatus(clientId);
  }

  @Get('requests')
  @Roles('ADMIN', 'CCO')
  @ApiOperation({ summary: 'List client service package change requests' })
  listRequests(@Query('status') status?: string) {
    return this.service.listRequests(status);
  }

  @Post('requests')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin creates a service package change request for CCO approval' })
  createRequest(
    @Body() dto: CreateModuleChangeRequestDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.createRequest(dto, user);
  }

  @Patch('requests/:id/review')
  @Roles('CCO')
  @ApiOperation({ summary: 'CCO approves or rejects a service package change request' })
  reviewRequest(
    @Param('id') id: string,
    @Body() dto: ReviewModuleChangeRequestDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.reviewRequest(id, dto, user);
  }
}
