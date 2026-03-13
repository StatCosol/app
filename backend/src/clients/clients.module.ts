import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from './entities/client.entity';
import { ClientUserEntity } from './entities/client-user.entity';
import { ClientsController } from './clients.controller';
import { CcoClientsController } from './cco-clients.controller';
import { AdminClientsController } from './admin-clients.controller';
import { ClientController } from './client.controller';
import { ClientsService } from './clients.service';
import { ClientListController } from './client-list.controller';
import { ClientsPortalController } from './clients-portal.controller';
import { UsersModule } from '../users/users.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ListQueriesModule } from '../list-queries/list-queries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, ClientUserEntity]),
    UsersModule,
    AuditLogsModule,
    ListQueriesModule,
  ],
  controllers: [
    ClientsController,
    CcoClientsController,
    AdminClientsController,
    ClientsPortalController,
    ClientController,
    ClientListController,
  ],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
