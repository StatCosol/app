import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cco_sla_rules')
export class CcoSlaRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  scope: string;

  @Column({ length: 20, default: 'NORMAL' })
  priority: string;

  @Column({ name: 'target_hours', type: 'int' })
  targetHours: number;

  @Column({ name: 'escalation_level1_hours', type: 'int' })
  escalationLevel1Hours: number;

  @Column({ name: 'escalation_level2_hours', type: 'int' })
  escalationLevel2Hours: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
