import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentsRotationService } from './assignments-rotation.service';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RoleEntity } from '../users/entities/role.entity';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientAssignmentCurrentEntity,
      UserEntity,
      RoleEntity,
    ]),
    AssignmentsModule,
  ],
  providers: [AssignmentsRotationService],
})
export class AssignmentsRotationModule {}
