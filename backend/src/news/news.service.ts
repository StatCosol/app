import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { NewsItemEntity } from './entities/news-item.entity';
import { CreateNewsDto } from './dto';
import { UpdateNewsDto } from './dto';

export interface NewsPaginated {
  data: NewsItemEntity[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(NewsItemEntity)
    private readonly repo: Repository<NewsItemEntity>,
  ) {}

  /** Active, non-expired news ordered pinned-first then newest (public endpoint) */
  async findActive(): Promise<NewsItemEntity[]> {
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoin('n.creator', 'c')
      .addSelect(['c.id', 'c.name'])
      .where('n.isActive = :active', { active: true })
      .andWhere(
        new Brackets((sub) =>
          sub
            .where('n.expiresAt IS NULL')
            .orWhere('n.expiresAt > :now', { now: new Date() }),
        ),
      )
      .orderBy('n.pinned', 'DESC')
      .addOrderBy('n.createdAt', 'DESC');
    return qb.getMany();
  }

  /** Admin: paginated list with optional search, category filter, status filter */
  async findAllAdmin(query: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string; // 'active' | 'inactive' | 'expired' | 'all'
  }): Promise<NewsPaginated> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoin('n.creator', 'c')
      .addSelect(['c.id', 'c.name'])
      .leftJoin('n.updater', 'u')
      .addSelect(['u.id', 'u.name']);

    // search
    if (query.search?.trim()) {
      qb.andWhere(
        new Brackets((sub) =>
          sub
            .where('LOWER(n.title) LIKE :q', {
              q: `%${query.search!.trim().toLowerCase()}%`,
            })
            .orWhere('LOWER(n.body) LIKE :q', {
              q: `%${query.search!.trim().toLowerCase()}%`,
            }),
        ),
      );
    }

    // category filter
    if (query.category) {
      qb.andWhere('n.category = :cat', { cat: query.category });
    }

    // status filter
    if (query.status === 'active') {
      qb.andWhere('n.isActive = true');
    } else if (query.status === 'inactive') {
      qb.andWhere('n.isActive = false');
    } else if (query.status === 'expired') {
      qb.andWhere('n.expiresAt IS NOT NULL').andWhere('n.expiresAt <= :now', {
        now: new Date(),
      });
    }

    qb.orderBy('n.pinned', 'DESC').addOrderBy('n.createdAt', 'DESC');

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  /** Single news item by id (with creator) */
  async findOne(id: string): Promise<NewsItemEntity | null> {
    return this.repo
      .createQueryBuilder('n')
      .leftJoin('n.creator', 'c')
      .addSelect(['c.id', 'c.name'])
      .where('n.id = :id', { id })
      .getOne();
  }

  /** Create a news item */
  async create(dto: CreateNewsDto, createdBy: string): Promise<NewsItemEntity> {
    const item = this.repo.create({
      title: dto.title,
      body: dto.body,
      category: dto.category || 'GENERAL',
      pinned: dto.pinned || false,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      imageUrl: dto.imageUrl || null,
      createdBy,
    });
    return this.repo.save(item);
  }

  /** Update a news item */
  async update(
    id: string,
    dto: UpdateNewsDto,
    updatedBy: string,
  ): Promise<NewsItemEntity | null> {
    const item = await this.findOne(id);
    if (!item) return null;

    if (dto.title !== undefined) item.title = dto.title;
    if (dto.body !== undefined) item.body = dto.body;
    if (dto.category !== undefined) item.category = dto.category;
    if (dto.pinned !== undefined) item.pinned = dto.pinned;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    if (dto.expiresAt !== undefined)
      item.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.imageUrl !== undefined) item.imageUrl = dto.imageUrl || null;
    item.updatedBy = updatedBy;

    return this.repo.save(item);
  }

  /** Soft-delete a news item */
  async remove(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
