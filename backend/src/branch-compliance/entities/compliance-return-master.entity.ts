import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('compliance_return_master')
export class ComplianceReturnMasterEntity {
  @PrimaryColumn({ name: 'return_code', type: 'varchar', length: 60 })
  returnCode: string;

  @Column({ name: 'return_name', type: 'varchar', length: 200 })
  returnName: string;

  @Column({ name: 'law_area', type: 'varchar', length: 40 })
  lawArea: string;

  @Column({
    name: 'frequency',
    type: 'varchar',
    length: 20,
    default: 'MONTHLY',
  })
  frequency: string;

  @Column({
    name: 'scope_default',
    type: 'varchar',
    length: 20,
    default: 'BRANCH',
  })
  scopeDefault: string;

  @Column({
    name: 'applicable_for',
    type: 'varchar',
    length: 20,
    default: 'BOTH',
  })
  applicableFor: string;

  @Column({ name: 'due_day', type: 'int', nullable: true })
  dueDay: number | null;

  @Column({ name: 'category', type: 'varchar', length: 60, nullable: true })
  category: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
