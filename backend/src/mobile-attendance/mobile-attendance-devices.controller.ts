import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { DeviceService } from './devices/device.service';
import { RegisterDeviceDto } from './devices/device.dto';
import { requireMobileAttendanceClient } from './mobile-attendance-controller.helpers';

@ApiTags('Mobile Attendance — Devices')
@ApiBearerAuth('JWT')
@Controller({ path: 'mobile-attendance/devices', version: '1' })
@Roles('CLIENT', 'ADMIN')
export class MobileAttendanceDevicesController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  @ApiOperation({
    summary: 'Admin — provision a new device and generate an install token',
  })
  @Post()
  provision(
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      mode: 'KIOSK' | 'ESS';
      branchId?: string;
      deviceLabel?: string;
      geofenceLat?: number;
      geofenceLng?: number;
      geofenceRadiusM?: number;
    },
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.deviceService.provisionDevice(
      clientId,
      body.mode,
      body.branchId ?? null,
      body.deviceLabel ?? null,
      user.userId,
      body.geofenceLat ?? null,
      body.geofenceLng ?? null,
      body.geofenceRadiusM ?? null,
    );
  }

  @ApiOperation({
    summary: 'Device — bind androidId to a pre-provisioned install token',
  })
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDeviceDto) {
    const device = await this.deviceService.registerDevice(
      dto.installToken,
      dto.androidId,
      dto.deviceName,
    );
    return {
      deviceToken: device.installToken,
      deviceId: device.id,
      mode: device.mode,
      clientId: device.clientId,
      branchId: device.branchId ?? null,
    };
  }

  @ApiOperation({ summary: 'List devices for the current client' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    const clientId = requireMobileAttendanceClient(user);
    const includeInstallToken = await this.entitlements.hasModule(
      clientId,
      'CONTRACTOR_FACE_ATTENDANCE',
    );
    return this.deviceService.listByClient(
      clientId,
      user.branchIds ?? [],
      includeInstallToken,
    );
  }

  @ApiOperation({ summary: 'Revoke a device' })
  @Delete(':deviceId')
  revoke(@Param('deviceId') deviceId: string, @CurrentUser() user: ReqUser) {
    const clientId = requireMobileAttendanceClient(user);
    return this.deviceService.revokeDevice(
      clientId,
      deviceId,
      user.userId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Permanently delete a revoked device' })
  @Delete(':deviceId/permanent')
  permanentlyDelete(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.deviceService.permanentlyDeleteDevice(
      clientId,
      deviceId,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Rename a device label' })
  @Patch(':deviceId/label')
  renameDevice(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { deviceLabel: string },
  ) {
    const clientId = requireMobileAttendanceClient(user);
    return this.deviceService.renameDevice(
      clientId,
      deviceId,
      body.deviceLabel,
      user.branchIds ?? [],
    );
  }

  @ApiOperation({ summary: 'Configure or clear the geofence for a device' })
  @Put(':deviceId/geofence')
  configureGeofence(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: ReqUser,
    @Body() body: { lat?: number; lng?: number; radiusM?: number } | null,
  ) {
    const clientId = requireMobileAttendanceClient(user);
    const params =
      body && body.lat != null && body.lng != null && body.radiusM != null
        ? { lat: body.lat, lng: body.lng, radiusM: body.radiusM }
        : null;
    return this.deviceService.configureGeofence(deviceId, clientId, params);
  }
}
