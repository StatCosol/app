import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  // allow digits, spaces, +, -, ()
  @Matches(/^[0-9+\-()\s]*$/, { message: 'Invalid mobile format' })
  mobile?: string | null;
}
