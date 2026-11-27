import { NotificationDigestService } from './notification-digest.service';
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { RejectionMailService } from './rejection-mail.service';

@Module({
  providers: [NotificationDigestService, EmailService, RejectionMailService],
  exports: [EmailService, RejectionMailService],
})
export class EmailModule {}
