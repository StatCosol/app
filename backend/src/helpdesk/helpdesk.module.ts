import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpdeskTicketEntity } from './entities/helpdesk-ticket.entity';
import { HelpdeskMessageEntity } from './entities/helpdesk-message.entity';
import { HelpdeskMessageFileEntity } from './entities/helpdesk-message-file.entity';
import { HelpdeskService } from './helpdesk.service';
import { RegistrationRequestsController } from './registration-requests.controller';
import {
  ClientHelpdeskController,
  HelpdeskMessagesController,
  PfTeamHelpdeskController,
  EssHelpdeskController,
  AdminHelpdeskController,
  CrmHelpdeskController,
  HelpdeskManagementController,
} from './helpdesk.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HelpdeskTicketEntity,
      HelpdeskMessageEntity,
      HelpdeskMessageFileEntity,
    ]),
  ],
  controllers: [
    RegistrationRequestsController,
    ClientHelpdeskController,
    PfTeamHelpdeskController,
    EssHelpdeskController,
    HelpdeskMessagesController,
    AdminHelpdeskController,
    CrmHelpdeskController,
    HelpdeskManagementController,
  ],
  providers: [HelpdeskService],
})
export class HelpdeskModule {}
