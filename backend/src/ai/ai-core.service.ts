import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { AiConfigurationEntity } from './entities/ai-configuration.entity';

export interface AiCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

@Injectable()
export class AiCoreService {
  private readonly logger = new Logger(AiCoreService.name);
  private openaiClient: OpenAI | null = null;
  private cachedConfig: AiConfigurationEntity | null = null;

  constructor(
    @InjectRepository(AiConfigurationEntity)
    private readonly configRepo: Repository<AiConfigurationEntity>,
  ) {}

  async getConfig(): Promise<AiConfigurationEntity | null> {
    if (this.cachedConfig) return this.cachedConfig;
    const config = await this.configRepo.findOne({ where: { isActive: true } });
    this.cachedConfig = config;
    return config;
  }

  async updateConfig(updates: Partial<{ provider: string; modelName: string; apiKey: string; temperature: number; maxTokens: number }>): Promise<AiConfigurationEntity> {
    let config = await this.configRepo.findOne({ where: { isActive: true } });
    if (!config) {
      config = this.configRepo.create({ provider: 'openai', modelName: 'gpt-4o-mini' });
    }
    if (updates.provider) config.provider = updates.provider;
    if (updates.modelName) config.modelName = updates.modelName;
    if (updates.apiKey) config.apiKeyEncrypted = updates.apiKey; // In production, encrypt this
    if (updates.temperature !== undefined) config.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) config.maxTokens = updates.maxTokens;
    
    const saved = await this.configRepo.save(config);
    this.cachedConfig = null;
    this.openaiClient = null; // force re-init
    return saved;
  }

  private async getClient(): Promise<OpenAI | null> {
    if (this.openaiClient) return this.openaiClient;
    const config = await this.getConfig();
    if (!config?.apiKeyEncrypted) {
      this.logger.warn('No AI API key configured. AI features unavailable.');
      return null;
    }
    this.openaiClient = new OpenAI({ apiKey: config.apiKeyEncrypted });
    return this.openaiClient;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<AiCompletionResult | null> {
    const client = await this.getClient();
    const config = await this.getConfig();
    if (!client || !config) return null;

    try {
      const response = await client.chat.completions.create({
        model: config.modelName,
        temperature: Number(config.temperature) || 0.3,
        max_tokens: config.maxTokens || 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      return {
        content: response.choices[0]?.message?.content || '{}',
        model: response.model,
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      };
    } catch (err) {
      this.logger.error('AI completion failed', err);
      return null;
    }
  }

  /** Returns true if AI is configured and ready */
  async isReady(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config?.apiKeyEncrypted && config.isActive);
  }
}
