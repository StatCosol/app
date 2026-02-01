import { IsInt, IsOptional } from 'class-validator';

export class LinkClientUserDto {
  @IsOptional()
  @IsInt()
  clientUserId?: number | null;
}
