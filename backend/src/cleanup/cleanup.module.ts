import { Module } from '@nestjs/common';
import { RetentionCleanupCronService } from './retention-cleanup-cron.service';
import { ClientArchivePurgeCronService } from './client-archive-purge-cron.service';
import { AdminArchiveController } from './admin-archive.controller';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [ClientsModule],
  controllers: [AdminArchiveController],
  providers: [RetentionCleanupCronService, ClientArchivePurgeCronService],
})
export class CleanupModule {}
