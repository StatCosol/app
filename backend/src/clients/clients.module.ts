import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from './entities/client.entity';
import { ClientUserEntity } from './entities/client-user.entity';
import { ClientsController } from './clients.controller';
import { CcoClientsController } from './cco-clients.controller';
import { AdminClientsController } from './admin-clients.controller';
import { ClientController } from './client.controller';
import { ClientsService } from './clients.service';
import { UsersModule } from '../users/users.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, ClientUserEntity]),
    UsersModule,
    AuditLogsModule,
  ],
  controllers: [
    ClientsController,
    CcoClientsController,
    AdminClientsController,
    ClientController,
  ],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
