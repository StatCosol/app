import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiometricPunchEntity } from './entities/biometric-punch.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AttendanceEntity } from '../attendance/entities/attendance.entity';
import { BiometricService } from './biometric.service';
import { BiometricController } from './biometric.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BiometricPunchEntity,
      EmployeeEntity,
      AttendanceEntity,
    ]),
  ],
  controllers: [BiometricController],
  providers: [BiometricService],
  exports: [BiometricService],
})
export class BiometricModule {}
