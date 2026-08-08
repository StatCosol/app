import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { FaceDeskDeviceService } from './facedesk-device.service';
import {
  facedeskBranchScope,
  requireFaceDeskClient,
  requireFaceDeskClientAdmin,
} from './facedesk-controller.helpers';

@ApiTags('FaceDesk V2')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk', version: '1' })
export class FaceDeskDevicesAdminController {
  constructor(private readonly devices: FaceDeskDeviceService) {}

  @ApiOperation({ summary: 'Provision a kiosk device (returns install token)' })
  @Post('devices')
  @Roles('CLIENT', 'ADMIN')
  provisionDevice(
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      deviceName: string;
      branchId?: string;
      location?: string;
      mode?: 'ATTENDANCE' | 'ENROLLMENT';
      adminPin?: string;
    },
  ) {
    return this.devices.provision(requireFaceDeskClientAdmin(user), {
      ...body,
      branchId: body?.branchId ?? user?.branchIds?.[0] ?? null,
    });
  }

  @ApiOperation({ summary: 'List kiosk devices' })
  @Get('devices')
  @Roles('CLIENT', 'ADMIN')
  listDevices(@CurrentUser() user: ReqUser) {
    return this.devices.list(
      requireFaceDeskClient(user),
      facedeskBranchScope(user),
    );
  }

  @ApiOperation({ summary: 'Revoke a kiosk device' })
  @Post('devices/:deviceId/revoke')
  @Roles('CLIENT', 'ADMIN')
  revokeDevice(
    @CurrentUser() user: ReqUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.revoke(requireFaceDeskClientAdmin(user), deviceId);
  }

  @ApiOperation({ summary: 'Delete a revoked kiosk device' })
  @Delete('devices/:deviceId')
  @Roles('CLIENT', 'ADMIN')
  deleteDevice(
    @CurrentUser() user: ReqUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.devices.remove(requireFaceDeskClientAdmin(user), deviceId);
  }
}
