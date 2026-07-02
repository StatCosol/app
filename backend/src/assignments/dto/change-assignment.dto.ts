import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ChangeAssignmentDto {
  @IsIn(['CRM', 'AUDITOR'])
  assignmentType!: 'CRM' | 'AUDITOR';

  @IsUUID()
  assignedToUserId!: string;

  @IsString()
  @IsNotEmpty()
  changeReason!: string; // MANUAL_OVERRIDE / AUTO_ROTATION / USER_INACTIVE etc.
}
