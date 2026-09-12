import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ListQueryDto } from '../common/dto/list-query.dto';
export class WorkQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @IsString() @MaxLength(30) module?: string;
  @IsOptional()
  @IsIn(['active', 'overdue', 'soon', 'returned', 'closed', 'all'])
  view?: string;
}
