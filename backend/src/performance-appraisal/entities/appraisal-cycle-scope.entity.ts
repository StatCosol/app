import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AppraisalCycleEntity } from './appraisal-cycle.entity';

@Entity({ name: 'appraisal_cycle_scopes' })
export class AppraisalCycleScopeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => AppraisalCycleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_id' })
  cycle?: AppraisalCycleEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  @Column({ name: 'employment_type', type: 'varchar', length: 30, nullable: true })
  employmentType: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
