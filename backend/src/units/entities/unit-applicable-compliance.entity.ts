import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UnitComplianceMasterEntity } from '../../masters/entities/unit-compliance-master.entity';

export type ApplicabilitySource = 'AUTO' | 'SPECIAL_SELECTED' | 'OVERRIDE';

@Entity({ name: 'unit_applicable_compliance' })
export class UnitApplicableComplianceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;

  @ManyToOne(() => UnitComplianceMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compliance_id' })
  compliance: UnitComplianceMasterEntity;

  @Column({ name: 'is_applicable', type: 'boolean' })
  isApplicable: boolean;

  @Column({ type: 'text', default: 'AUTO' })
  source: ApplicabilitySource;

  @Column({ name: 'override_reason', type: 'text', nullable: true })
  overrideReason: string | null;

  @Column({ name: 'computed_by', type: 'uuid', nullable: true })
  computedBy: string | null;

  @Column({ name: 'computed_at', type: 'timestamptz', default: () => 'now()' })
  computedAt: Date;
}
