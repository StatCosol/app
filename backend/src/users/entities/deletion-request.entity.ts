import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('deletion_requests')
export class DeletionRequestEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // e.g. 'USER', 'CLIENT' etc.
  @Column({ name: 'entity_type', type: 'varchar', length: 50 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  // Role that is allowed to approve (e.g. 'CCO', 'CEO')
  @Column({ name: 'required_approver_role', type: 'varchar', length: 30 })
  requiredApproverRole: string;

  // Optional specific approver (user-level routing). When set, overrides role routing.
  @Column({ name: 'required_approver_user_id', type: 'uuid', nullable: true })
  requiredApproverUserId: string | null;

  // PENDING / APPROVED / REJECTED
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  requestedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
