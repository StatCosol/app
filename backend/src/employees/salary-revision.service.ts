import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalaryRevisionEntity } from './entities/salary-revision.entity';

@Injectable()
export class SalaryRevisionService {
  constructor(
    @InjectRepository(SalaryRevisionEntity)
    private readonly repo: Repository<SalaryRevisionEntity>,
  ) {}

  async create(
    dto: {
      clientId: string;
      employeeId: string;
      effectiveDate: string;
      previousCtc: number;
      newCtc: number;
      reason?: string;
      approvedByUserId?: string;
      componentSnapshot?: Record<string, any>;
    },
    createdByUserId: string,
  ) {
    const incrementPct =
      dto.previousCtc > 0
        ? (((dto.newCtc - dto.previousCtc) / dto.previousCtc) * 100).toFixed(2)
        : null;

    const entity = this.repo.create({
      clientId: dto.clientId,
      employeeId: dto.employeeId,
      effectiveDate: dto.effectiveDate,
      previousCtc: dto.previousCtc.toFixed(2),
      newCtc: dto.newCtc.toFixed(2),
      incrementPct,
      reason: dto.reason ?? null,
      approvedByUserId: dto.approvedByUserId ?? null,
      componentSnapshot: dto.componentSnapshot ?? null,
      createdByUserId,
    });
    return this.repo.save(entity);
  }

  async listForEmployee(clientId: string, employeeId: string) {
    return this.repo.find({
      where: { clientId, employeeId },
      order: { effectiveDate: 'DESC' },
    });
  }

  async getLatest(clientId: string, employeeId: string) {
    return this.repo.findOne({
      where: { clientId, employeeId },
      order: { effectiveDate: 'DESC' },
    });
  }

  async findById(id: string) {
    const rev = await this.repo.findOne({ where: { id } });
    if (!rev) throw new NotFoundException('Salary revision not found');
    return rev;
  }

  async uploadLetter(id: string, filePath: string) {
    const rev = await this.findById(id);
    rev.revisionLetterPath = filePath;
    return this.repo.save(rev);
  }
}
