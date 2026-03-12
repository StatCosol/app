import { IsObject } from 'class-validator';

export class SaveActProfileDto {
  @IsObject()
  dataJson: Record<string, any>;
}
