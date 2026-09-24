import { ClientCommPolicyService } from './client-comm-policy.service';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
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
    AccessModule,
  ],
  controllers: [ClientContactsController],
  providers: [
    ClientCommPolicyService,
    ClientContactsService,
    ClientCommsCronService,
    ClientCommTemplatesService,
  ],
  exports: [ClientContactsService],
})
export class ClientContactsModule {}
