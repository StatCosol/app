import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class BulkReminderDto {
  @IsArray()
  @IsUUID('4', { each: true })
  taskIds: string[];

  @IsOptional()
  @IsString()
  message?: string;
}
