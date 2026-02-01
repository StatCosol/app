import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangeMyPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string;
}
