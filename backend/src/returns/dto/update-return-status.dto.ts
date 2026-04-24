import { IsIn, IsOptional, IsString } from 'class-validator';
import { ReturnStatus } from '../entities/compliance-return.entity';

export class UpdateReturnStatusDto {
  @IsIn([
    'APPROVED',
    'REJECTED',
    'PENDING',
    'SUBMITTED',
    'IN_PROGRESS',
    'NOT_APPLICABLE',
  ] satisfies ReturnStatus[])
  status!: ReturnStatus;

  @IsString()
  @IsOptional()
  reason?: string | null;
}
