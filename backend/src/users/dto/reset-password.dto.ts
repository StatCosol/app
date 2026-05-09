import { IsEmail, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.validator';

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword: string;
}
