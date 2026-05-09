import { IsString, IsOptional } from 'class-validator';

export class UpdateAuditCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
