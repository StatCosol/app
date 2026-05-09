import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { ClientDepartmentContactEntity } from './client-department-contact.entity';
import { ClientCommTemplateEntity } from './client-comm-template.entity';
import { ClientContactsService } from './client-contacts.service';
import { ClientContactsController } from './client-contacts.controller';
import { ClientCommsCronService } from './client-comms-cron.service';
import { ClientCommTemplatesService } from './client-comm-templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientDepartmentContactEntity,
      ClientCommTemplateEntity,
    ]),
    EmailModule,
  ],
  controllers: [ClientContactsController],
  providers: [
    ClientContactsService,
    ClientCommsCronService,
    ClientCommTemplatesService,
  ],
  exports: [ClientContactsService],
})
export class ClientContactsModule {}
