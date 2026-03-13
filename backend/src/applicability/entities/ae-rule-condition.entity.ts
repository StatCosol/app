import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_rule_condition')
@Index('UQ_AE_RULE_COND', ['ruleId'], { unique: true })
export class AeRuleConditionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  /** JSON DSL supporting { all: [...] }, { any: [...] }, leaf nodes */
  @Column({ name: 'condition_json', type: 'jsonb', default: () => "'{}'" })
  conditionJson: Record<string, any>;
}
