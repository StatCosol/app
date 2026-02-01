import { IsString, MinLength, IsEmail } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string; // Using email for login

  @IsString()
  @MinLength(6)
  password: string;
}
