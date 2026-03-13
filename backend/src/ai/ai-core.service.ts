import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import { AiConfigurationEntity } from './entities/ai-configuration.entity';
import { AiCostTrackingService } from './ai-cost-tracking.service';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.AI_ENCRYPTION_KEY || '';
  if (!raw) {
    // Fallback key for dev — in production AI_ENCRYPTION_KEY env var MUST be set
    return crypto.scryptSync('statco-dev-key-change-me', 'salt', 32);
  }
  // Accept hex-encoded 32-byte key or derive from passphrase
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.scryptSync(raw, 'statco-ai', 32);
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    'utf8',
  );
}

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
    private readonly costTracking: AiCostTrackingService,
  ) {}

  async getConfig(): Promise<AiConfigurationEntity | null> {
    if (this.cachedConfig) return this.cachedConfig;
    const config = await this.configRepo.findOne({ where: { isActive: true } });
    this.cachedConfig = config;
    return config;
  }

  async updateConfig(
    updates: Partial<{
      provider: string;
      modelName: string;
      apiKey: string;
      temperature: number;
      maxTokens: number;
    }>,
  ): Promise<AiConfigurationEntity> {
    let config = await this.configRepo.findOne({ where: { isActive: true } });
    if (!config) {
      config = this.configRepo.create({
        provider: 'openai',
        modelName: 'gpt-4o-mini',
      });
    }
    if (updates.provider) config.provider = updates.provider;
    if (updates.modelName) config.modelName = updates.modelName;
    if (updates.apiKey) config.apiKeyEncrypted = encrypt(updates.apiKey);
    if (updates.temperature !== undefined)
      config.temperature = updates.temperature;
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
    let apiKey: string;
    try {
      apiKey = decrypt(config.apiKeyEncrypted);
    } catch {
      // Fallback: key may have been stored as plaintext before encryption was added
      apiKey = config.apiKeyEncrypted;
    }
    this.openaiClient = new OpenAI({ apiKey });
    return this.openaiClient;
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<AiCompletionResult | null> {
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

  /** Complete with automatic cost tracking */
  async completeWithTracking(
    systemPrompt: string,
    userPrompt: string,
    context?: { clientId?: string; userId?: string; module?: string },
  ): Promise<AiCompletionResult | null> {
    const result = await this.complete(systemPrompt, userPrompt);
    if (result) {
      this.costTracking
        .logUsage({
          clientId: context?.clientId,
          userId: context?.userId,
          module: context?.module ?? 'general',
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        })
        .catch((err) => this.logger.warn('Cost tracking log failed', err));
    }
    return result;
  }

  /** Returns true if AI is configured and ready */
  async isReady(): Promise<boolean> {
    const config = await this.getConfig();
    return !!(config?.apiKeyEncrypted && config.isActive);
  }
}
