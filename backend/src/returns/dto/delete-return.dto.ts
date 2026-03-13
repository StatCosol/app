import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
