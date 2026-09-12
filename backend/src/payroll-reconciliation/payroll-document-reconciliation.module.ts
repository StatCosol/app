import { Module } from '@nestjs/common';
import { PayrollDocumentReconciliationService } from './payroll-document-reconciliation.service';
@Module({
  providers: [PayrollDocumentReconciliationService],
  exports: [PayrollDocumentReconciliationService],
})
export class PayrollDocumentReconciliationModule {}
