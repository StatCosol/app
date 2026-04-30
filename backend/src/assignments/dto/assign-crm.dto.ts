import { IsUUID } from 'class-validator';

export class AssignCrmDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  crmId: string;
}
