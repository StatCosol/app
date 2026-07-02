import { IsIn } from 'class-validator';

export class NotificationStatusDto {
  @IsIn(['OPEN', 'READ', 'CLOSED'])
  status: 'OPEN' | 'READ' | 'CLOSED';
}
