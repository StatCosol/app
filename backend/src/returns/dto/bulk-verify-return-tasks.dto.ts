import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BulkVerifyReturnTasksDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  taskIds: string[];
}
