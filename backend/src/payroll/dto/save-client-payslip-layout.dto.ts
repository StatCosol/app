import { IsObject } from 'class-validator';

export class SaveClientPayslipLayoutDto {
  @IsObject()
  layout: any;
}
