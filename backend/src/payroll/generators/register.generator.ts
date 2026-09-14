import { GoneException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterTemplateEntity } from '../entities/register-template.entity';

/** Legacy template metadata is retained for reference, never used to certify a register. */
@Injectable()
export class RegisterGenerator {
  constructor(
    @InjectRepository(RegisterTemplateEntity)
    private readonly templateRepo: Repository<RegisterTemplateEntity>,
  ) {}

  private retired(): never {
    throw new GoneException({
      code: 'ACT_SPECIFIC_REGISTER_REQUIRED',
      message:
        'Choose the branch, period, Act and prescribed register in the Register Library. Generic payroll register generation has been retired.',
      replacement: '/api/v1/payroll/register-library',
    });
  }
  async generate(
    _runId: string,
    _stateCode: string,
    _registerType: string,
    _userId: string,
  ) {
    return this.retired();
  }
  async generateAllForBranch(
    _runId: string,
    _branchId: string,
    _userId: string,
  ) {
    return this.retired();
  }
  async listTemplatesForBranch(_branchId: string) {
    return this.retired();
  }
  async listTemplates(stateCode?: string) {
    const where: { isActive: true; stateCode?: string } = { isActive: true };
    if (stateCode) where.stateCode = stateCode;
    const rows = await this.templateRepo.find({
      where,
      order: { stateCode: 'ASC', registerType: 'ASC' },
    });
    return rows.map((row) => ({
      ...row,
      generation: 'REFERENCE_ONLY',
      preparationAvailable: false,
    }));
  }
}
