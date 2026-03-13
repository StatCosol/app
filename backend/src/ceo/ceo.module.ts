import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CeoController } from './ceo.controller';
import { CeoDashboardController } from './ceo-dashboard.controller';
import { CeoListController } from './ceo-list.controller';
import { CeoDashboardService } from './ceo-dashboard.service';
import { ApprovalEntity } from '../users/entities/approval.entity';
import { UsersModule } from '../users/users.module';
import { ListQueriesModule } from '../list-queries/list-queries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApprovalEntity]),
    UsersModule,
    ListQueriesModule,
  ],
  controllers: [CeoController, CeoDashboardController, CeoListController],
  providers: [CeoDashboardService],
})
export class CeoModule {}
