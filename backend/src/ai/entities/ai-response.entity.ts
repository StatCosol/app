import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AiRequestEntity } from './ai-request.entity';

@Entity({ name: 'ai_responses' })
export class AiResponseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ai_request_id', type: 'uuid' })
  aiRequestId: string;

  @ManyToOne(() => AiRequestEntity, { eager: false })
  @JoinColumn({ name: 'ai_request_id' })
  aiRequest?: AiRequestEntity;

  @Column({ name: 'response_text', type: 'text', nullable: true })
  responseText: string | null;

  @Column({ name: 'response_json', type: 'jsonb', default: '{}' })
  responseJson: Record<string, any>;

  @Column({ type: 'numeric', precision: 5, scale: 4, nullable: true })
  confidence: number | null;

  @Column({ name: 'tokens_used', type: 'int', nullable: true })
  tokensUsed: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
