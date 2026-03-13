import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'unit_applicability_audit' })
export class UnitApplicabilityAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'text' })
  action: string; // FACTS_UPDATED | RECOMPUTED | OVERRIDE_APPLIED | SPECIAL_ACT_SELECTED

  @Column({ name: 'before_json', type: 'jsonb', nullable: true })
  beforeJson: any;

  @Column({ name: 'after_json', type: 'jsonb', nullable: true })
  afterJson: any;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
