import {
  IsArray,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ReuploadItemDto {
  @IsString()
  @IsNotEmpty()
  docId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Remarks must be at least 5 characters' })
  remarks!: string;
}

export class CreateReuploadRequestsDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReuploadItemDto)
  items!: ReuploadItemDto[];
}
