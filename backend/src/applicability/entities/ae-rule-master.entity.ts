import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { RuleApplyMode, UnitType } from './enums';

@Entity('ae_rule_master')
export class AeRuleMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Index()
  @Column({ name: 'priority', type: 'int' })
  priority: number;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'scope', type: 'varchar', length: 20 })
  scope: UnitType;

  @Column({ name: 'apply_mode', type: 'varchar', length: 30 })
  applyMode: RuleApplyMode;

  @Column({
    name: 'target_package_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  targetPackageCode: string | null;

  @Column({ name: 'target_compliance_id', type: 'uuid', nullable: true })
  targetComplianceId: string | null;

  @Column({ name: 'effect_json', type: 'jsonb', default: () => "'{}'" })
  effectJson: Record<string, any>;
}
