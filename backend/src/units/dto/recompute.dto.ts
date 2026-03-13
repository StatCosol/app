import { IsOptional, IsString } from 'class-validator';

export class RecomputeDto {
  @IsString()
  packageId: string; // accepts UUID or package code (e.g. 'DEFAULT_INDIA')

  @IsOptional()
  onDate?: string;
}
