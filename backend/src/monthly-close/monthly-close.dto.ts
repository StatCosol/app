import { IsUUID, Matches } from 'class-validator';

export class MonthlyCloseQueryDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  branchId!: string;

  @Matches(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  month!: string;
}
