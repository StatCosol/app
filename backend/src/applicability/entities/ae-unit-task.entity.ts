import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { TaskStatus } from './enums';

@Entity('ae_unit_task')
@Index('UQ_AE_UNIT_TASK', ['unitId', 'complianceId', 'periodStart'], {
  unique: true,
})
export class AeUnitTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;

  /** YYYY-MM-DD for periodic tasks; null for one-off EVENT tasks */
  @Column({ name: 'period_start', type: 'date', nullable: true })
  periodStart: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: TaskStatus.OPEN,
  })
  status: TaskStatus;

  @Column({
    name: 'assignee_role',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  assigneeRole: string | null;

  @Column({
    name: 'generated_by',
    type: 'varchar',
    length: 30,
    default: 'ENGINE',
  })
  generatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
