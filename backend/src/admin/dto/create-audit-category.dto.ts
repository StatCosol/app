import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateAuditCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
