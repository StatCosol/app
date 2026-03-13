import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiRequestEntity,
  AiRequestModule,
  AiRequestStatus,
} from './entities/ai-request.entity';
import { AiResponseEntity } from './entities/ai-response.entity';

/**
 * Logs every AI call into ai_requests + ai_responses for audit trail.
 */
@Injectable()
export class AiRequestLogService {
  private readonly logger = new Logger(AiRequestLogService.name);

  constructor(
    @InjectRepository(AiRequestEntity)
    private readonly reqRepo: Repository<AiRequestEntity>,
    @InjectRepository(AiResponseEntity)
    private readonly resRepo: Repository<AiResponseEntity>,
  ) {}

  /** Create a new AI request log entry */
  async createRequest(params: {
    module: AiRequestModule;
    entityType?: string;
    entityId?: string;
    payload: Record<string, any>;
    createdBy?: string;
    tenantId?: string;
  }): Promise<AiRequestEntity> {
    const entity = this.reqRepo.create({
      module: params.module,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      requestPayload: params.payload,
      createdBy: params.createdBy || null,
      tenantId: params.tenantId || null,
      status: 'PENDING',
    });
    return this.reqRepo.save(entity);
  }

  /** Update request status */
  async updateRequestStatus(
    requestId: string,
    status: AiRequestStatus,
  ): Promise<void> {
    await this.reqRepo.update(requestId, { status });
  }

  /** Save AI response linked to a request */
  async saveResponse(params: {
    aiRequestId: string;
    responseText?: string;
    responseJson: Record<string, any>;
    confidence?: number;
    tokensUsed?: number;
    model?: string;
  }): Promise<AiResponseEntity> {
    const entity = this.resRepo.create({
      aiRequestId: params.aiRequestId,
      responseText: params.responseText || null,
      responseJson: params.responseJson,
      confidence: params.confidence ?? null,
      tokensUsed: params.tokensUsed ?? null,
      model: params.model || null,
    });
    return this.resRepo.save(entity);
  }

  /** Complete a request: mark DONE + save response in one call */
  async completeRequest(
    requestId: string,
    responseJson: Record<string, any>,
    meta?: {
      confidence?: number;
      tokensUsed?: number;
      model?: string;
      responseText?: string;
    },
  ): Promise<AiResponseEntity> {
    await this.updateRequestStatus(requestId, 'DONE');
    return this.saveResponse({
      aiRequestId: requestId,
      responseJson,
      responseText: meta?.responseText,
      confidence: meta?.confidence,
      tokensUsed: meta?.tokensUsed,
      model: meta?.model,
    });
  }

  /** Mark request as failed */
  async failRequest(requestId: string, error?: string): Promise<void> {
    await this.updateRequestStatus(requestId, 'FAILED');
    if (error) {
      this.logger.error(`AI request ${requestId} failed: ${error}`);
    }
  }

  /** Get request + responses by id */
  async getRequest(requestId: string): Promise<AiRequestEntity | null> {
    return this.reqRepo.findOne({ where: { id: requestId } });
  }

  /** List recent requests */
  async listRequests(opts: {
    module?: string;
    status?: string;
    limit?: number;
  }): Promise<AiRequestEntity[]> {
    const qb = this.reqRepo.createQueryBuilder('r');
    if (opts.module) qb.andWhere('r.module = :m', { m: opts.module });
    if (opts.status) qb.andWhere('r.status = :s', { s: opts.status });
    return qb
      .orderBy('r.createdAt', 'DESC')
      .take(opts.limit || 50)
      .getMany();
  }
}
