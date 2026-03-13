import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class NomineeDto {
  @IsString() memberName: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() sharePct?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() isMinor?: boolean;
}

export class SaveNominationDto {
  @IsUUID() employeeId: string;

  @IsIn(['PF', 'ESI', 'GRATUITY', 'INSURANCE', 'SALARY'])
  nominationType: 'PF' | 'ESI' | 'GRATUITY' | 'INSURANCE' | 'SALARY';

  @IsOptional() @IsString() declarationDate?: string;
  @IsOptional() @IsString() witnessName?: string;
  @IsOptional() @IsString() witnessAddress?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NomineeDto)
  nominees: NomineeDto[];
}
