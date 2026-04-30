import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class NotificationListQueryDto {
  @IsOptional()
  @IsIn(['INBOX', 'OUTBOX'])
  box?: 'INBOX' | 'OUTBOX';

  @IsOptional()
  @IsIn(['UNREAD', 'READ', 'CLOSED'])
  status?: 'UNREAD' | 'READ' | 'CLOSED';

  @IsOptional()
  @IsIn(['TECHNICAL', 'COMPLIANCE', 'AUDIT', 'SYSTEM'])
  queryType?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  search?: string; // subject/message search

  @IsOptional()
  @IsString()
  fromDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  toDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;
}
