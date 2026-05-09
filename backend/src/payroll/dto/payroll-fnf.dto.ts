import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsNumber,
} from 'class-validator';

export class CreateFnfDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  separationDate: string;

  @IsOptional()
  @IsDateString()
  lastWorkingDay?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  checklist?: Record<string, unknown>;

  @IsOptional()
  settlementBreakup?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateFnfStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  checklist?: Record<string, unknown>;

  @IsOptional()
  settlementBreakup?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  settlementAmount?: number;
}
