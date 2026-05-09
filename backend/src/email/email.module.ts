import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { RejectionMailService } from './rejection-mail.service';

@Module({
  providers: [EmailService, RejectionMailService],
  exports: [EmailService, RejectionMailService],
})
export class EmailModule {}
