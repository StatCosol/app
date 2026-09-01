import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricPunchEntity } from './entities/biometric-punch.entity';
import { BiometricDeviceEntity } from './entities/biometric-device.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { ContractorEmployeeEntity } from '../contractor/contractor-employees/entities/contractor-employee.entity';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';
import { BiometricService } from './biometric.service';
import { BiometricController } from './biometric.controller';
import { BiometricDevicesController } from './biometric-devices.controller';
import { EsslService } from './essl.service';
import { ContractorDaysService } from './contractor-days.service';
import { EsslIclockController } from './essl-iclock.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BiometricPunchEntity,
      BiometricDeviceEntity,
      EmployeeEntity,
      AttendanceEntity,
      ContractorEmployeeEntity,
      ContractorBiometricPunchEntity,
    ]),
  ],
  controllers: [
    BiometricController,
    BiometricDevicesController,
    EsslIclockController,
  ],
  providers: [BiometricService, EsslService, ContractorDaysService],
  exports: [BiometricService, EsslService, ContractorDaysService],
})
export class BiometricModule {}
