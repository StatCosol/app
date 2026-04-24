import { IsString, MinLength, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.validator';

export class ChangeMyPasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @IsStrongPassword()
  newPassword!: string;
}
