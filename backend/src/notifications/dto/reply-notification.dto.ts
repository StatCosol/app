import { IsOptional, IsString, MinLength } from 'class-validator';

export class ReplyNotificationDto {
  @IsString()
  @MinLength(1)
  message: string;

  // keep as a simple path for now, matches your DB
  @IsOptional()
  @IsString()
  attachmentPath?: string;
}
