import { IsString, MinLength, IsEmail, IsNotEmpty } from 'class-validator';

export class EssLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Company code is required' })
  companyCode: string;

  @IsEmail({}, { message: 'Valid email is required' })
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
