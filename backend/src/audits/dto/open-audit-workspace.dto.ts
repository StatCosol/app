import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class OpenAuditWorkspaceDto {
  @ApiProperty()
  @IsUUID()
  scheduleId!: string;
}
