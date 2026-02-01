import { AuditType, Frequency } from '../../common/enums';

export class CreateAuditDto {
  clientId: string;
  contractorUserId?: string | null;
  frequency: Frequency;
  auditType: AuditType;
  periodYear: number;
  periodCode: string; // e.g. 2025-01, 2025-Q1, 2025-H1, 2025
  assignedAuditorId: string;
  dueDate?: string;
  notes?: string;
}
