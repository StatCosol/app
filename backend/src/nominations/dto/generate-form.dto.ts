import { IsIn, IsUUID } from 'class-validator';

export class GenerateFormDto {
  @IsUUID() employeeId: string;

  @IsIn(['PF', 'ESI', 'GRATUITY', 'INSURANCE', 'SALARY'])
  formType: 'PF' | 'ESI' | 'GRATUITY' | 'INSURANCE' | 'SALARY';
}
