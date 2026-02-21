import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_component_slabs' })
export class PayrollComponentSlabEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @Column({ name: 'from_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  fromAmount: string;

  @Column({ name: 'to_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  toAmount: string | null;

  @Column({ name: 'slab_pct', type: 'numeric', precision: 8, scale: 4, nullable: true })
  slabPct: string | null;

  @Column({ name: 'slab_fixed', type: 'numeric', precision: 14, scale: 2, nullable: true })
  slabFixed: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
