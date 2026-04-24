import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteReturnDto {
  @IsNotEmpty({ message: 'Reason is required when deleting a return' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
