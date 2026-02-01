import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * Maps to migrations/statco_schema_final.sql table: deletion_audit
 *
 * CREATE TABLE deletion_audit (
 *   id bigserial,
 *   entity_type varchar(50),
 *   entity_id uuid,
 *   performed_by uuid,
 *   remarks text,
 *   created_at timestamptz
 * );
 */
@Entity('deletion_audit')
export class DeletionAuditEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'performed_by' })
  performedBy: UserEntity;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
