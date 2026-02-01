import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CeoController } from './ceo.controller';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalEntity]), UsersModule],
  controllers: [CeoController],
})
export class CeoModule {}
