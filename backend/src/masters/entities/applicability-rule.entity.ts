import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UnitComplianceMasterEntity } from './unit-compliance-master.entity';

export type RuleEffect = 'ENABLE' | 'DISABLE';

@Entity({ name: 'applicability_rule' })
@Index(['stateCode', 'priority'])
export class ApplicabilityRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'state_code', type: 'text', nullable: true })
  stateCode: string | null;

  @Column({ type: 'int' })
  priority: number;

  @Column({ name: 'target_compliance_id', type: 'uuid' })
  targetComplianceId: string;

  @ManyToOne(() => UnitComplianceMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_compliance_id' })
  targetCompliance: UnitComplianceMasterEntity;

  @Column({ type: 'text' })
  effect: RuleEffect;

  @Column({ name: 'conditions_json', type: 'jsonb' })
  conditionsJson: any;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
