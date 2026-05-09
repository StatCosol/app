import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class BulkReviewReturnInputDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  taskIds: string[];

  @IsIn(['READY_FOR_FILING', 'RETURNED_TO_BRANCH'])
  action: 'READY_FOR_FILING' | 'RETURNED_TO_BRANCH';

  @IsOptional()
  @IsString()
  remarks?: string;
}
