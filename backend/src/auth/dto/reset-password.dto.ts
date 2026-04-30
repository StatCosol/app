import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/strong-password.validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword!: string;
}
