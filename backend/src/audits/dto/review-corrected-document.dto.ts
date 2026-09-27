import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewCorrectedDocumentDto {
  @IsIn(['COMPLIED', 'NON_COMPLIED'])
  decision: 'COMPLIED' | 'NON_COMPLIED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;
}
