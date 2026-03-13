import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class UpsertFactsDto {
  @IsObject()
  factsJson: Record<string, any>;

  @IsOptional()
  @IsUUID()
  updatedBy?: string;
}
