import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ai_configurations' })
export class AiConfigurationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, default: 'openai' })
  provider: string;

  @Column({
    name: 'model_name',
    type: 'varchar',
    length: 100,
    default: 'gpt-4o-mini',
  })
  modelName: string;

  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
  apiKeyEncrypted: string | null;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0.3 })
  temperature: number;

  @Column({ name: 'max_tokens', type: 'int', default: 2000 })
  maxTokens: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
