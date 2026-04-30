import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrmReturnActionDto {
  @IsIn(['RETURN', 'REMINDER', 'OWNER', 'NOTE'])
  action!: 'RETURN' | 'REMINDER' | 'OWNER' | 'NOTE';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  owner?: string;
}
