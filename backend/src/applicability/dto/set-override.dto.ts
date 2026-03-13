import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetOverrideDto {
  @IsOptional()
  @IsBoolean()
  forceApplicable?: boolean | null;

  @IsOptional()
  @IsBoolean()
  forceNotApplicable?: boolean | null;

  @IsOptional()
  @IsBoolean()
  locked?: boolean | null;

  @IsOptional()
  @IsString()
  reason?: string | null;
}
