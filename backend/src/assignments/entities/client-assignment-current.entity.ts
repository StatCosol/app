import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AssignmentType = 'CRM' | 'AUDITOR';

@Entity('client_assignments_current')
@Index(['clientId', 'assignmentType'], { unique: true })
export class ClientAssignmentCurrentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'assignment_type', type: 'varchar' })
  assignmentType!: AssignmentType;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId!: string | null;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
