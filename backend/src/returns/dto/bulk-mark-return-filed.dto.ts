import { ArrayNotEmpty, IsArray, IsDateString, IsUUID } from 'class-validator';

export class BulkMarkReturnFiledDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  taskIds: string[];

  @IsDateString()
  filedOn: string;
}
