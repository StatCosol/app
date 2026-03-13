import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sla_compliance_rules')
export class SlaComplianceRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'compliance_item_id', type: 'uuid' })
  complianceItemId: string;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null; // NULL = all states

  @Column({
    name: 'establishment_type',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  establishmentType: string | null; // NULL = all types

  @Column({ type: 'boolean', default: true })
  applicable: boolean;

  // ── Due-date fields ──
  @Column({ name: 'due_day', type: 'int', nullable: true })
  dueDay: number | null;

  @Column({ name: 'due_month_offset', type: 'int', default: 0 })
  dueMonthOffset: number;

  // ── Fixed month (for HALF_YEARLY / YEARLY) ──
  @Column({ name: 'due_month', type: 'int', nullable: true })
  dueMonth: number | null; // 1-12: Jan-Dec; NULL = use current month + offset

  // ── Window-based (MCD-style) ──
  @Column({ name: 'window_open_day', type: 'int', nullable: true })
  windowOpenDay: number | null;

  @Column({ name: 'window_close_day', type: 'int', nullable: true })
  windowCloseDay: number | null;

  // ── SLA creation lead time ──
  @Column({ name: 'create_before_days', type: 'int', default: 5 })
  createBeforeDays: number;

  // ── Overrides ──
  @Column({ type: 'varchar', length: 15, nullable: true })
  priority: string | null; // NULL = use item default

  @Column({ name: 'sla_days', type: 'int', nullable: true })
  slaDays: number | null;

  @Column({ name: 'title_template', type: 'text', nullable: true })
  titleTemplate: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
