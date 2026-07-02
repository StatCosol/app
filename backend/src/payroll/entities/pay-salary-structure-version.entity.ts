import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'pay_salary_structure_versions' })
@Index(['structureId', 'versionNo'], { unique: true })
export class PaySalaryStructureVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'structure_id', type: 'uuid' })
  structureId: string;

  @Column({ name: 'version_no', type: 'int' })
  versionNo: number;

  /** Snapshot of all pay_salary_structure_items rows for this structure at this point in time. */
  @Column({ name: 'items_snapshot', type: 'jsonb' })
  itemsSnapshot: Record<string, unknown>[];

  @Column({ name: 'reason', type: 'varchar', length: 80, nullable: true })
  reason: string | null;

  @Column({ name: 'changed_by_id', type: 'uuid', nullable: true })
  changedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
