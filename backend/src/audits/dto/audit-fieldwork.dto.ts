import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class AddFieldworkItemDto {
  @IsString() @MinLength(3) @MaxLength(255) label: string;
  @IsIn(['DOCUMENT', 'SITE_INSPECTION']) kind: string;
}
export class UploadFieldworkEvidenceDto {
  @IsString() @MinLength(5) @MaxLength(5000) description: string;
  @IsOptional() @IsString() @MaxLength(250) location?: string;
}
export class ReviewFieldworkDto {
  @IsIn(['PENDING', 'COMPLIED', 'NON_COMPLIED', 'NOT_APPLICABLE'])
  decision: string;
  @IsString() @MinLength(5) @MaxLength(10000) remarks: string;
  @IsInt() @Min(0) revision: number;
  @IsOptional() @IsBoolean() automationReviewed?: boolean;
}
