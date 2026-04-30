import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePayrollQueryDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}

export class AddQueryMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ResolveQueryDto {
  @IsString()
  @IsNotEmpty()
  resolution: string;
}

export class UpdateQueryStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;
}
