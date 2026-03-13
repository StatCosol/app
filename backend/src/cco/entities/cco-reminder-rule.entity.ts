import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cco_reminder_rules')
export class CcoReminderRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  scope: string;

  @Column({ name: 'days_before_due', type: 'int' })
  daysBeforeDue: number;

  @Column({ name: 'notify_roles', type: 'text', array: true, default: '{}' })
  notifyRoles: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
