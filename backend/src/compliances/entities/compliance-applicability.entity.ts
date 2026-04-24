import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BranchCategory = 'FACTORY' | 'ESTABLISHMENT';

@Entity('compliance_applicability')
export class ComplianceApplicabilityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId!: string;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode!: string | null;

  @Column({ name: 'branch_category', type: 'varchar', length: 30 })
  branchCategory!: BranchCategory;

  @Column({ name: 'min_headcount', type: 'int', nullable: true })
  minHeadcount!: number | null;

  @Column({ name: 'max_headcount', type: 'int', nullable: true })
  maxHeadcount!: number | null;

  @Column({ type: 'int', default: 100 })
  priority!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
