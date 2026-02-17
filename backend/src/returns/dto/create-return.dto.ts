import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReturnDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsNotEmpty()
  lawType!: string;

  @IsString()
  @IsNotEmpty()
  returnType!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  periodMonth?: number | null;

  @IsString()
  @IsOptional()
  periodLabel?: string | null;

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;
}
