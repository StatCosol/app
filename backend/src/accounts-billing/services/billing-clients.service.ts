import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingClient } from '../entities';
import { CreateBillingClientDto, UpdateBillingClientDto } from '../dto';

@Injectable()
export class BillingClientsService {
  constructor(
    @InjectRepository(BillingClient)
    private readonly repo: Repository<BillingClient>,
  ) {}

  async create(dto: CreateBillingClientDto, tenantId: string) {
    const billingCode = await this.generateBillingCode();
    const client = this.repo.create({
      ...dto,
      tenantId,
      billingCode,
    });
    return this.repo.save(client);
  }

  async update(id: string, dto: UpdateBillingClientDto) {
    const client = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Billing client not found');
    Object.assign(client, dto);
    return this.repo.save(client);
  }

  async findAll(query: { page?: number; limit?: number; search?: string; status?: string }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 25, 100);

    const qb = this.repo
      .createQueryBuilder('bc')
      .orderBy('bc.createdAt', 'DESC');

    if (query.search) {
      qb.andWhere(
        '(bc.legal_name ILIKE :s OR bc.billing_code ILIKE :s OR bc.billing_email ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.status) {
      qb.andWhere('bc.status = :status', { status: query.status });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const client = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Billing client not found');
    return client;
  }

  async findActive() {
    return this.repo.find({
      where: { status: 'ACTIVE' },
      order: { legalName: 'ASC' },
    });
  }

  private async generateBillingCode(): Promise<string> {
    const last = await this.repo
      .createQueryBuilder('bc')
      .where('bc.billing_code LIKE :prefix', { prefix: 'BC-%' })
      .orderBy('bc.billingCode', 'DESC')
      .getOne();

    let seq = 1;
    if (last) {
      const num = parseInt(last.billingCode.replace('BC-', ''), 10);
      if (!isNaN(num)) seq = num + 1;
    }
    return `BC-${String(seq).padStart(4, '0')}`;
  }
}
