import { IsUUID } from 'class-validator';

export class AssignAuditorDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  auditorId: string;
}
