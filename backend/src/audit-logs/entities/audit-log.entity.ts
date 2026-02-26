import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

export type AuditEntityType =
  | 'CLIENT'
  | 'BRANCH'
  | 'ASSIGNMENT'
  | 'CONTRACTOR'
  | 'USER'
  | 'SYSTEM';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'SOFT_DELETE'
  | 'RESTORE'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'ROTATE'
  | 'DELETE_REQUEST'
  | 'DELETE_REJECT'
  | 'STATUS_CHANGE'
  | 'PASSWORD_RESET'
  | 'MASTER_DATA_UPDATED';

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: AuditEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ type: 'varchar', length: 50 })
  action: AuditAction;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  snapshot: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
