import { IsBoolean } from 'class-validator';

export class ToggleActDto {
  @IsBoolean()
  enabled: boolean;
}
