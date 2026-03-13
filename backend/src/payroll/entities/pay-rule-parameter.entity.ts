import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'pay_rule_parameters' })
@Index(['ruleSetId', 'key'], { unique: true })
export class PayRuleParameterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'rule_set_id', type: 'uuid' })
  ruleSetId: string;

  @Column({ name: 'key', type: 'varchar', length: 80 })
  key: string;

  @Column({
    name: 'value_num',
    type: 'numeric',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  valueNum: number | null;

  @Column({ name: 'value_text', type: 'varchar', length: 200, nullable: true })
  valueText: string | null;

  @Column({ name: 'unit', type: 'varchar', length: 20, nullable: true })
  unit: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;
}
