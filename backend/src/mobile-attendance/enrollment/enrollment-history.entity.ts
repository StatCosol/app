import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'face_enrollment_history' })
@Index(['employeeId'])
@Index(['contractorEmployeeId'])
export class FaceEnrollmentHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'contractor_employee_id', type: 'uuid', nullable: true })
  contractorEmployeeId: string | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  /** ENROLL | RE_ENROLL | DEACTIVATE | DELETE */
  @Column({ name: 'action', type: 'varchar', length: 20 })
  action: string;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'embedding_model', type: 'varchar', length: 40, nullable: true })
  embeddingModel: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
