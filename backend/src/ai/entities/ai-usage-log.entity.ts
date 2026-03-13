import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'ai_usage_logs' })
@Index(['clientId', 'month'])
export class AiUsageLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'module', type: 'varchar', length: 50 })
  module: string;

  @Column({ name: 'month', type: 'varchar', length: 7 })
  month: string; // YYYY-MM

  @Column({ name: 'prompt_tokens', type: 'int', default: 0 })
  promptTokens: number;

  @Column({ name: 'completion_tokens', type: 'int', default: 0 })
  completionTokens: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens: number;

  @Column({
    name: 'estimated_cost_usd',
    type: 'numeric',
    precision: 10,
    scale: 6,
    default: 0,
  })
  estimatedCostUsd: string;

  @Column({ name: 'model', type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
