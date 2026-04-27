import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { BiometricDeviceEntity } from './entities/biometric-device.entity';
import {
  RegisterDeviceDto,
  UpdateDeviceDto,
} from './biometric-devices.dto';

@ApiTags('Biometric Devices')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/biometric/devices', version: '1' })
@Roles('CLIENT', 'ADMIN', 'CRM')
export class BiometricDevicesController {
  constructor(
    @InjectRepository(BiometricDeviceEntity)
    private readonly repo: Repository<BiometricDeviceEntity>,
  ) {}

  @ApiOperation({ summary: 'List biometric devices for the current client' })
  @Get()
  async list(@CurrentUser() user: ReqUser) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    return this.repo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  @ApiOperation({
    summary: 'Register an eSSL/ZKTeco device by its serial number',
  })
  @Post()
  async register(
    @CurrentUser() user: ReqUser,
    @Body() body: RegisterDeviceDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    const sn = body.serialNumber.trim();
    const existing = await this.repo.findOne({ where: { serialNumber: sn } });
    if (existing) {
      throw new BadRequestException(
        `Device with serial ${sn} is already registered`,
      );
    }

    const device = this.repo.create({
      clientId,
      branchId: body.branchId ?? null,
      serialNumber: sn,
      pushToken: randomBytes(24).toString('hex'),
      vendor: body.vendor || 'ESSL',
      model: body.model ?? null,
      label: body.label ?? null,
      enabled: true,
    });
    return this.repo.save(device);
  }

  @ApiOperation({ summary: 'Enable/disable a device or change its branch/label' })
  @Patch(':id')
  async update(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateDeviceDto,
  ) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');

    const device = await this.repo.findOne({ where: { id, clientId } });
    if (!device) throw new NotFoundException('Device not found');

    if (body.enabled !== undefined) device.enabled = body.enabled;
    if (body.branchId !== undefined) device.branchId = body.branchId;
    if (body.label !== undefined) device.label = body.label;
    return this.repo.save(device);
  }

  @ApiOperation({ summary: 'Rotate the push token (invalidates current SN auth)' })
  @Post(':id/rotate-token')
  async rotate(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const device = await this.repo.findOne({ where: { id, clientId } });
    if (!device) throw new NotFoundException('Device not found');
    device.pushToken = randomBytes(24).toString('hex');
    return this.repo.save(device);
  }

  @ApiOperation({ summary: 'Delete a device registration' })
  @Delete(':id')
  async remove(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const clientId = user?.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const device = await this.repo.findOne({ where: { id, clientId } });
    if (!device) throw new NotFoundException('Device not found');
    await this.repo.remove(device);
    return { ok: true };
  }
}
