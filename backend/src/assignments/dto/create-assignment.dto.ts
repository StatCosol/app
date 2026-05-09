import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsNotEmpty()
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  crmId?: string;

  @IsOptional()
  @IsUUID()
  auditorId?: string;
}
