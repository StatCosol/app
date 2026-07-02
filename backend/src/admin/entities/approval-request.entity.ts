import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'approval_requests', schema: 'public' })
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, name: 'request_type' })
  requestType: string; // DELETE_BRANCH, DELETE_CONTRACTOR, DELETE_USER, PAYROLL_FINALIZATION

  @Column({ type: 'uuid', name: 'requester_user_id' })
  requesterUserId: string;

  @Column({ type: 'uuid', name: 'approver_user_id', nullable: true })
  approverUserId: string | null;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string; // PENDING, APPROVED, REJECTED

  @Column({ type: 'uuid', name: 'target_entity_id' })
  targetEntityId: string;

  @Column({ type: 'varchar', length: 50, name: 'target_entity_type' })
  targetEntityType: string; // branch, user, contractor, payroll_run

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', name: 'approver_notes', nullable: true })
  approverNotes: string | null;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
