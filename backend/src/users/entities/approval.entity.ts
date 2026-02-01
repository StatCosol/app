import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * Maps to migrations/statco_schema_final.sql table: approvals
 *
 * CREATE TABLE approvals (
 *   id bigserial,
 *   entity_type varchar(50),
 *   entity_id uuid,
 *   action varchar(30),
 *   status varchar(20),
 *   remarks text,
 *   requested_by uuid,
 *   requested_to uuid,
 *   created_at timestamptz,
 *   updated_at timestamptz
 * )
 */
@Entity('approvals')
export class ApprovalEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'action', type: 'varchar', length: 30 })
  action: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'requested_by' })
  requestedBy: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'requested_to' })
  requestedTo: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
