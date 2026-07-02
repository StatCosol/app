import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientUpdatePayrollInputStatusDto {
  @IsIn(['SUBMITTED', 'CANCELLED'])
  status: 'SUBMITTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
