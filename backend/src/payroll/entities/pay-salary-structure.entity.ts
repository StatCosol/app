import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'pay_salary_structures' })
@Index(['clientId', 'scopeType', 'effectiveFrom'])
export class PaySalaryStructureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'name', type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 30 })
  scopeType: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'rule_set_id', type: 'uuid' })
  ruleSetId: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
