import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitFactsEntity } from '../entities/unit-facts.entity';

export class UnitFactsDto {
  stateCode: string;
  establishmentType: 'FACTORY' | 'ESTABLISHMENT' | 'BOTH';
  isHazardous: boolean;
  industryCategory?: string;
  employeeTotal: number;
  employeeMale?: number;
  employeeFemale?: number;
  contractWorkersTotal?: number;
  contractorsCount?: number;
  isBocwProject?: boolean;
  hasCanteen?: boolean;
  hasCreche?: boolean;
}

@Injectable()
export class UnitsFactsService {
  constructor(
    @InjectRepository(UnitFactsEntity)
    private readonly repo: Repository<UnitFactsEntity>,
  ) {}

  getFacts(branchId: string) {
    return this.repo.findOne({ where: { branchId } });
  }

  async upsertFacts(
    branchId: string,
    dto: UnitFactsDto,
    actorUserId: string | null,
  ) {
    let row = await this.repo.findOne({ where: { branchId } });
    if (!row) {
      row = this.repo.create({ branchId } as Partial<UnitFactsEntity>);
    }

    row.stateCode = dto.stateCode;
    row.establishmentType = dto.establishmentType;
    row.isHazardous = dto.isHazardous;
    row.industryCategory = dto.industryCategory ?? null;
    row.employeeTotal = dto.employeeTotal;
    row.employeeMale = dto.employeeMale ?? 0;
    row.employeeFemale = dto.employeeFemale ?? 0;
    row.contractWorkersTotal = dto.contractWorkersTotal ?? 0;
    row.contractorsCount = dto.contractorsCount ?? 0;
    row.isBocwProject = dto.isBocwProject ?? false;
    row.hasCanteen = dto.hasCanteen ?? null;
    row.hasCreche = dto.hasCreche ?? null;
    row.updatedBy = actorUserId;
    row.updatedAt = new Date();

    return this.repo.save(row);
  }
}
