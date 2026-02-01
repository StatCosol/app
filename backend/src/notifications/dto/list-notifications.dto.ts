import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ListNotificationsDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESPONDED', 'RESOLVED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsIn(['TECHNICAL', 'COMPLIANCE', 'AUDIT', 'GENERAL'])
  queryType?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @Type(() => Number)
  unreadOnly?: number; // 1 => only unread

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
