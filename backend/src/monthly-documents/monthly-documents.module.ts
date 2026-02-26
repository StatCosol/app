import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyComplianceUploadEntity } from './entities/monthly-compliance-upload.entity';
import { MonthlyDocumentsService } from './monthly-documents.service';
import { MonthlyDocumentsController } from './monthly-documents.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([MonthlyComplianceUploadEntity]),
  ],
  controllers: [MonthlyDocumentsController],
  providers: [MonthlyDocumentsService],
  exports: [MonthlyDocumentsService],
})
export class MonthlyDocumentsModule {}
