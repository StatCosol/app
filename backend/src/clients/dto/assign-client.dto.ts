import { IsUUID } from 'class-validator';

export class AssignClientDto {
  @IsUUID()
  assignedCrmId: string;

  @IsUUID()
  assignedAuditorId: string;
}
