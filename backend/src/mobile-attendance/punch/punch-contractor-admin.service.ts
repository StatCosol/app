import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorBiometricPunchEntity } from './contractor-punch.entity';

@Injectable()
export class PunchContractorAdminService {
  constructor(
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly contractorPunchRepo: Repository<ContractorBiometricPunchEntity>,
  ) {}

  async listContractorPunches(
    clientId: string,
    opts: {
      from?: string;
      to?: string;
      branchId?: string;
      contractorEmployeeId?: string;
      contractorUserId?: string;
      limit?: number;
    } = {},
  ): Promise<ContractorBiometricPunchEntity[]> {
    const qb = this.contractorPunchRepo
      .createQueryBuilder('p')
      .where('p.clientId = :clientId', { clientId })
      .orderBy('p.punchTime', 'DESC');

    if (opts.from) qb.andWhere('p.punchTime >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('p.punchTime <= :to', { to: opts.to });
    if (opts.branchId)
      qb.andWhere('p.branchId = :branchId', { branchId: opts.branchId });
    if (opts.contractorEmployeeId)
      qb.andWhere('p.contractorEmployeeId = :contractorEmployeeId', {
        contractorEmployeeId: opts.contractorEmployeeId,
      });
    if (opts.contractorUserId) {
      qb.andWhere(
        `p.contractorEmployeeId IN (
          SELECT ce.id FROM contractor_employees ce
           WHERE ce.client_id = :clientId
             AND ce.contractor_user_id = :contractorUserId
        )`,
        { clientId, contractorUserId: opts.contractorUserId },
      );
    }
    if (opts.limit) qb.take(opts.limit);

    return qb.getMany();
  }

  async createContractorPunch(
    clientId: string,
    body: {
      contractorEmployeeId: string;
      punchTime: string;
      direction: 'IN' | 'OUT' | 'AUTO';
    },
  ): Promise<{ ok: true; id: string }> {
    const punch = await this.contractorPunchRepo.save({
      clientId,
      branchId: null,
      deviceId: '00000000-0000-0000-0000-000000000000',
      contractorEmployeeId: body.contractorEmployeeId,
      direction: body.direction,
      punchTime: new Date(body.punchTime),
      offlineSync: false,
    });
    return { ok: true, id: punch.id };
  }

  async updateContractorPunch(
    clientId: string,
    id: string,
    body: { punchTime?: string; direction?: string },
  ): Promise<{ ok: true; id: string; punchTime: string; direction: string }> {
    const punch = await this.contractorPunchRepo.findOne({
      where: { id, clientId },
    });
    if (!punch) throw new NotFoundException('Contractor punch not found');

    if (body.punchTime) punch.punchTime = new Date(body.punchTime);
    if (body.direction)
      punch.direction = body.direction as 'IN' | 'OUT' | 'AUTO';

    const saved = await this.contractorPunchRepo.save(punch);
    return {
      ok: true,
      id: saved.id,
      punchTime: saved.punchTime.toISOString(),
      direction: saved.direction,
    };
  }

  async deleteContractorPunch(
    clientId: string,
    id: string,
  ): Promise<{ ok: true; deleted: number }> {
    const result = await this.contractorPunchRepo.delete({ id, clientId });
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Contractor punch not found');
    }
    return { ok: true, deleted: result.affected };
  }
}
