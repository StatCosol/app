import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cco_escalation_thresholds')
export class CcoEscalationThresholdEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  type: string;

  @Column({ type: 'int' })
  value: number;

  @Column({ name: 'window_days', type: 'int', default: 30 })
  windowDays: number;

  @Column({ length: 20, default: 'MEDIUM' })
  severity: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
