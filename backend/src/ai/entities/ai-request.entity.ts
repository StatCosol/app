import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiRequestStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type AiRequestModule =
  | 'COMPLIANCE'
  | 'AUDIT'
  | 'DOCUMENT'
  | 'QUERY'
  | 'RISK'
  | 'GENERAL';

@Entity({ name: 'ai_requests' })
export class AiRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 50, default: 'GENERAL' })
  module: AiRequestModule;

  @Column({ name: 'entity_type', type: 'varchar', length: 50, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'request_payload', type: 'jsonb', default: '{}' })
  requestPayload: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: AiRequestStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
