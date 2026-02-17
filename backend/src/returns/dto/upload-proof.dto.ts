import { IsOptional, IsString } from 'class-validator';

export class UploadProofDto {
  @IsString()
  @IsOptional()
  ackNumber?: string | null;
}
