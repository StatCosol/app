import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  IsNotEmpty,
  IsIn,
  IsArray,
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

  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  // For CRM users: required owner CCO id
  @IsOptional()
  @IsUUID()
  ownerCcoId?: string;

  // For CLIENT users: MASTER or BRANCH
  @IsOptional()
  @IsIn(['MASTER', 'BRANCH'])
  userType?: 'MASTER' | 'BRANCH';

  // For BRANCH CLIENT users: branch IDs to assign
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];
}
