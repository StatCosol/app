import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
export class CreateUserDto {
  @IsUUID()
  @IsNotEmpty()
  roleId: string;

  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @Transform(({ value }) =>
    value == null || value === '' ? undefined : String(value),
  )
  @IsString()
  mobile?: string;

  @MinLength(6)
  password: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  // For CRM users: required owner CCO id
  @IsOptional()
  @IsUUID()
  ownerCcoId?: string;
}
