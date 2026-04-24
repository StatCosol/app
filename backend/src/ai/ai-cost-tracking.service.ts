import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLogEntity } from './entities/ai-usage-log.entity';

/** Per-model pricing (USD per 1K tokens) — update as rates change */
const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  'gpt-4.1': { prompt: 0.002, completion: 0.008 },
  'gpt-4.1-mini': { prompt: 0.0004, completion: 0.0016 },
  'gpt-4.1-nano': { prompt: 0.0001, completion: 0.0004 },
  'gpt-4o': { prompt: 0.0025, completion: 0.01 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  'o3-mini': { prompt: 0.0011, completion: 0.0044 },
};

@Injectable()
export class AiCostTrackingService {

  constructor(
    @InjectRepository(AiUsageLogEntity)
    private readonly usageRepo: Repository<AiUsageLogEntity>,
  ) {}

  /** Log a single AI call's token usage */
  async logUsage(params: {
    clientId?: string;
    userId?: string;
    module: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }) {
    const totalTokens = params.promptTokens + params.completionTokens;
    const pricing =
      MODEL_PRICING[params.model] ?? MODEL_PRICING['gpt-4.1-mini'];
    const cost =
      (params.promptTokens / 1000) * pricing.prompt +
      (params.completionTokens / 1000) * pricing.completion;

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const entity = this.usageRepo.create({
      clientId: params.clientId ?? null,
      userId: params.userId ?? null,
      module: params.module,
      month,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens,
      estimatedCostUsd: cost.toFixed(6),
      model: params.model,
    });

    return this.usageRepo.save(entity);
  }

  /** Get monthly usage summary for a client (or all clients if null) */
  async getMonthlySummary(month: string, clientId?: string) {
    const qb = this.usageRepo
      .createQueryBuilder('u')
      .select('u.month', 'month')
      .addSelect('u.module', 'module')
      .addSelect('SUM(u.prompt_tokens)', 'totalPromptTokens')
      .addSelect('SUM(u.completion_tokens)', 'totalCompletionTokens')
      .addSelect('SUM(u.total_tokens)', 'totalTokens')
      .addSelect('SUM(u.estimated_cost_usd::numeric)', 'totalCostUsd')
      .addSelect('COUNT(*)', 'callCount')
      .where('u.month = :month', { month });

    if (clientId) {
      qb.andWhere('u.client_id = :clientId', { clientId });
    }

    qb.groupBy('u.month').addGroupBy('u.module');

    const rows = await qb.getRawMany();

    const totalCost = rows.reduce(
      (sum, r) => sum + Number(r.totalCostUsd || 0),
      0,
    );
    const totalTokens = rows.reduce(
      (sum, r) => sum + Number(r.totalTokens || 0),
      0,
    );

    return {
      month,
      totalCostUsd: totalCost.toFixed(4),
      totalTokens,
      breakdown: rows.map((r) => ({
        module: r.module,
        callCount: Number(r.callCount),
        totalTokens: Number(r.totalTokens),
        costUsd: Number(r.totalCostUsd || 0).toFixed(4),
      })),
    };
  }
}
