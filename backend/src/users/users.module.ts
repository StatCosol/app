import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { DeletionRequestEntity } from './entities/deletion-request.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MeController } from './me.controller';
import { CcoUsersController } from './cco-users.controller';
import { ApprovalsController } from './approvals.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      UserEntity,
      DeletionRequestEntity,
      ClientEntity,
    ]),
  ],
  controllers: [
    UsersController,
    CcoUsersController,
    ApprovalsController,
    MeController,
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
