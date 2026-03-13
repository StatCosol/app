import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaySalaryStructureEntity } from '../entities/pay-salary-structure.entity';
import { PaySalaryStructureItemEntity } from '../entities/pay-salary-structure-item.entity';

type ScopeType = 'EMPLOYEE' | 'GRADE' | 'DEPARTMENT' | 'BRANCH' | 'TENANT';

interface ResolveParams {
  clientId: string;
  employeeId: string | null;
  branchId: string | null;
  departmentId: string | null;
  gradeId: string | null;
  asOfDate: string;
}

interface ResolveResult {
  structure: PaySalaryStructureEntity;
  items: PaySalaryStructureItemEntity[];
}

@Injectable()
export class StructureResolverService {
  constructor(
    @InjectRepository(PaySalaryStructureEntity)
    private readonly structureRepo: Repository<PaySalaryStructureEntity>,
    @InjectRepository(PaySalaryStructureItemEntity)
    private readonly itemRepo: Repository<PaySalaryStructureItemEntity>,
  ) {}

  async resolve(params: ResolveParams): Promise<ResolveResult | null> {
    const { clientId, employeeId, branchId, departmentId, gradeId, asOfDate } =
      params;

    const scopes: {
      scope: ScopeType;
      fkColumn: string;
      fkValue: string | null;
    }[] = [
      { scope: 'EMPLOYEE', fkColumn: 's.employee_id', fkValue: employeeId },
      { scope: 'GRADE', fkColumn: 's.grade_id', fkValue: gradeId },
      {
        scope: 'DEPARTMENT',
        fkColumn: 's.department_id',
        fkValue: departmentId,
      },
      { scope: 'BRANCH', fkColumn: 's.branch_id', fkValue: branchId },
      { scope: 'TENANT', fkColumn: '', fkValue: clientId },
    ];

    for (const { scope, fkColumn, fkValue } of scopes) {
      if (scope !== 'TENANT' && !fkValue) {
        continue;
      }

      const structure = await this.findStructure(
        clientId,
        scope,
        fkColumn,
        fkValue,
        asOfDate,
      );

      if (structure) {
        const items = await this.loadItems(structure.id);
        return { structure, items };
      }
    }

    return null;
  }

  private async findStructure(
    clientId: string,
    scope: ScopeType,
    fkColumn: string,
    fkValue: string | null,
    asOfDate: string,
  ): Promise<PaySalaryStructureEntity | undefined> {
    const qb = this.structureRepo
      .createQueryBuilder('s')
      .where('s.client_id = :clientId', { clientId })
      .andWhere('s.scope_type = :scope', { scope })
      .andWhere('s.is_active = true')
      .andWhere('s.effective_from <= :asOf', { asOf: asOfDate })
      .andWhere('(s.effective_to IS NULL OR s.effective_to >= :asOf)', {
        asOf: asOfDate,
      })
      .orderBy('s.effective_from', 'DESC')
      .limit(1);

    if (scope !== 'TENANT' && fkColumn) {
      qb.andWhere(`${fkColumn} = :fkValue`, { fkValue });
    }

    return (await qb.getOne()) ?? undefined;
  }

  private async loadItems(
    structureId: string,
  ): Promise<PaySalaryStructureItemEntity[]> {
    return this.itemRepo.find({
      where: { structureId, enabled: true },
      order: { priority: 'ASC' },
    });
  }
}
