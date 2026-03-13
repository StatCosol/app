import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompliancePackageEntity } from './compliance-package.entity';
import { ApplicabilityRuleEntity } from './applicability-rule.entity';

@Entity({ name: 'package_rule' })
@Index(['packageId', 'ruleId'], { unique: true })
export class PackageRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @ManyToOne(() => CompliancePackageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: CompliancePackageEntity;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => ApplicabilityRuleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: ApplicabilityRuleEntity;
}
