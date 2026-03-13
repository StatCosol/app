import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'ai_insights' })
export class AiInsightEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'insight_type', type: 'varchar', length: 100 })
  insightType: string;

  @Column({ type: 'varchar', length: 50, default: 'GENERAL' })
  category: string;

  @Column({ type: 'varchar', length: 20, default: 'INFO' })
  severity: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', default: '{}' })
  data: Record<string, any>;

  @Column({ name: 'is_dismissed', type: 'boolean', default: false })
  isDismissed: boolean;

  @Column({ name: 'dismissed_by', type: 'uuid', nullable: true })
  dismissedBy: string | null;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
