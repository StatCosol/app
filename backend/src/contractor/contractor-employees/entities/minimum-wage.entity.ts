import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type MinimumWageSkill =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

@Entity('minimum_wages')
@Index('idx_mw_state_skill_sched_eff', [
  'stateCode',
  'skillCategory',
  'scheduledEmployment',
  'effectiveFrom',
])
export class MinimumWageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'state_code', type: 'varchar', length: 8 })
  stateCode: string;

  @Column({ name: 'skill_category', type: 'varchar', length: 20 })
  skillCategory: MinimumWageSkill;

  /**
   * Labour-law "schedule of employment" (e.g. "Shops & Establishments",
   * "Security Services", "Construction"). NULL acts as a wildcard / default
   * row when no schedule-specific rate has been notified.
   */
  @Column({
    name: 'scheduled_employment',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  scheduledEmployment: string | null;

  @Column({
    name: 'monthly_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      to: (v: number | null | undefined) => v ?? null,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  monthlyWage: number;

  @Column({
    name: 'daily_wage',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null | undefined) => v ?? null,
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  dailyWage: number | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'source', type: 'varchar', length: 255, nullable: true })
  source: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
