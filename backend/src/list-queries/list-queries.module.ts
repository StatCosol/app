import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { TaskListService } from './task-list.service';
import { ReturnListService } from './return-list.service';
import { DocListService } from './doc-list.service';
import { ThreadListService } from './thread-list.service';
import { EmployeeListService } from './employee-list.service';
import { AuditListService } from './audit-list.service';
import { EscalationListService } from './escalation-list.service';

const SERVICES = [
  TaskListService,
  ReturnListService,
  DocListService,
  ThreadListService,
  EmployeeListService,
  AuditListService,
  EscalationListService,
];

/**
 * Centralised list-query services.
 * Each service wraps one entity group with standard
 * search / sort / paginate / scope enforcement.
 *
 * Import this module in any portal module that needs paginated list endpoints.
 */
@Module({
  imports: [AccessModule],
  providers: SERVICES,
  exports: SERVICES,
})
export class ListQueriesModule {}
