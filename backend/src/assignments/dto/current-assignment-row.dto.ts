export class CurrentAssignmentRowDto {
  clientId!: string;
  crmId!: string | null;
  auditorId!: string | null;
  startDate!: Date | null;
  status!: 'ASSIGNED' | 'PENDING';
}
