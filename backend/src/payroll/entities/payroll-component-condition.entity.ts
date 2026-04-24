import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayrollStructureComponentEntity } from './payroll-structure-component.entity';

@Entity('payroll_component_conditions')
export class PayrollComponentConditionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @ManyToOne(() => PayrollStructureComponentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'component_id' })
  component: PayrollStructureComponentEntity;

  @Column({ name: 'field_name', type: 'varchar', length: 80 })
  fieldName: string;

  @Column({
    name: 'operator',
    type: 'varchar',
    length: 10,
  })
  operator: 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE';

  @Column({ name: 'field_value', type: 'varchar', length: 100 })
  fieldValue: string;

  @Column({
    name: 'action_type',
    type: 'varchar',
    length: 30,
  })
  actionType:
    | 'SET_FIXED'
    | 'APPLY_PERCENT'
    | 'ENABLE'
    | 'DISABLE'
    | 'WARNING';

  @Column({
    name: 'action_value',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  actionValue: string | null;

  @Column({ name: 'message', type: 'varchar', length: 255, nullable: true })
  message: string | null;
}
