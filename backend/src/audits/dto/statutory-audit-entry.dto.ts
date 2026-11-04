import {
  ArrayNotEmpty,
  ArrayUnique,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ConfigureAuditEntryDto {
  @IsIn(['PHYSICAL', 'ONLINE']) auditMode: string;
  @Equals('FACTORY') unitType: string;
  @IsString() @MaxLength(200) auditeeName: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  categories: string[];
  @Equals(true) scopeAcknowledged: boolean;
}
export class ReviewAuditEntryDocumentDto {
  @IsIn(['APPROVED', 'REJECTED']) status: string;
  @IsString() @MaxLength(4000) remarks: string;
  @IsInt() @Min(0) version: number;
}
export class SaveAuditEntryDto {
  @IsString() @MaxLength(4000) answer: string;
  @IsIn(['COMPLIED', 'NON_COMPLIED', 'NOT_APPLICABLE']) status: string;
  @IsString() @MaxLength(10000) remarks: string;
  @IsInt() @Min(0) version: number;
}
