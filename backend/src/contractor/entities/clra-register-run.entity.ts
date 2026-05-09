import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ClraContractorAssignment } from './clra-contractor-assignment.entity';
import { ClraWagePeriod } from './clra-wage-period.entity';

@Entity({ name: 'clra_register_runs' })
@Index('IDX_CLRA_RUN_ASSIGNMENT', ['assignmentId'])
@Index('IDX_CLRA_RUN_PERIOD', ['wagePeriodId'])
export class ClraRegisterRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId: string;

  @Column({ name: 'wage_period_id', type: 'uuid', nullable: true })
  wagePeriodId: string | null;

  @Column({ name: 'register_code', length: 30 })
  registerCode: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string | null;

  @Column({ name: 'generated_by_user_id', type: 'uuid', nullable: true })
  generatedByUserId: string | null;

  @Column({ name: 'version_no', type: 'int', default: 1 })
  versionNo: number;

  @Column({ length: 30, default: 'GENERATED' })
  status: string;

  @ManyToOne(() => ClraContractorAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ClraContractorAssignment;

  @ManyToOne(() => ClraWagePeriod, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'wage_period_id' })
  wagePeriod: ClraWagePeriod | null;

  @CreateDateColumn({ name: 'generated_at' })
  generatedAt: Date;
}
