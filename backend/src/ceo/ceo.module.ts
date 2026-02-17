import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CeoController } from './ceo.controller';
import { CeoDashboardController } from './ceo-dashboard.controller';
import { CeoDashboardService } from './ceo-dashboard.service';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalEntity]), UsersModule],
  controllers: [CeoController, CeoDashboardController],
  providers: [CeoDashboardService],
})
export class CeoModule {}
