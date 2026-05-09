import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmployeeAppraisalEntity } from './employee-appraisal.entity';

@Entity({ name: 'employee_appraisal_items' })
export class EmployeeAppraisalItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'employee_appraisal_id', type: 'uuid' })
  employeeAppraisalId: string;

  @ManyToOne(() => EmployeeAppraisalEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_appraisal_id' })
  employeeAppraisal?: EmployeeAppraisalEntity;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @Column({ name: 'template_item_id', type: 'uuid', nullable: true })
  templateItemId: string | null;

  @Column({ name: 'item_name', type: 'varchar', length: 150 })
  itemName: string;

  @Column({
    name: 'weightage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  weightage: number;

  @Column({ name: 'target_value', type: 'text', nullable: true })
  targetValue: string | null;

  @Column({ name: 'achievement_value', type: 'text', nullable: true })
  achievementValue: string | null;

  @Column({
    name: 'self_rating',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  selfRating: number | null;

  @Column({
    name: 'manager_rating',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  managerRating: number | null;

  @Column({
    name: 'branch_rating',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  branchRating: number | null;

  @Column({
    name: 'final_rating',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  finalRating: number | null;

  @Column({
    name: 'weighted_score',
    type: 'numeric',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  weightedScore: number | null;

  @Column({ name: 'employee_remarks', type: 'text', nullable: true })
  employeeRemarks: string | null;

  @Column({ name: 'manager_remarks', type: 'text', nullable: true })
  managerRemarks: string | null;

  @Column({ name: 'branch_remarks', type: 'text', nullable: true })
  branchRemarks: string | null;

  @Column({ name: 'final_remarks', type: 'text', nullable: true })
  finalRemarks: string | null;

  @Column({ name: 'sequence', type: 'int', default: 0 })
  sequence: number;
}
