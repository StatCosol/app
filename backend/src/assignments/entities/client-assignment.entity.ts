import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { UserEntity } from '../../users/entities/user.entity';

export enum AssignmentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('client_assignments')
@Index('IDX_CLIENT_ASSIGNMENTS_CLIENT_UNIQUE', ['clientId'], { unique: true })
export class ClientAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity)
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  @Column({ name: 'crm_user_id', type: 'uuid', nullable: true })
  crmUserId: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'crm_user_id' })
  crmUser: UserEntity;

  @Column({ name: 'auditor_user_id', type: 'uuid', nullable: true })
  auditorUserId: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'auditor_user_id' })
  auditorUser: UserEntity;

  // Legacy overall window (kept for compatibility)
  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  // Per-role assignment windows used by rotation
  @Column({ name: 'crm_assigned_from', type: 'date', nullable: true })
  crmAssignedFrom: string | null;

  @Column({ name: 'crm_assigned_to', type: 'date', nullable: true })
  crmAssignedTo: string | null;

  @Column({ name: 'auditor_assigned_from', type: 'date', nullable: true })
  auditorAssignedFrom: string | null;

  @Column({ name: 'auditor_assigned_to', type: 'date', nullable: true })
  auditorAssignedTo: string | null;

  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.ACTIVE,
  })
  status: AssignmentStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
