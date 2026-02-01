import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateClientDto {
  @IsOptional()
  @IsString()
  clientCode?: string;

  @IsString()
  clientName: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedCrmId?: string;

  @IsOptional()
  @IsUUID()
  assignedAuditorId?: string;
}
