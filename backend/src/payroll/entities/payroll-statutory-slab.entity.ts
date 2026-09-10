import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_statutory_slabs' })
@Index(['clientId', 'stateCode', 'componentCode'])
export class PayrollStatutorySlabEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'state_code', type: 'varchar', length: 10, default: 'ALL' })
  stateCode: string;

  @Column({ name: 'component_code', type: 'varchar', length: 30 })
  componentCode: string;

  @Column({
    name: 'from_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  fromAmount: string;

  @Column({
    name: 'to_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  toAmount: string | null;

  @Column({
    name: 'value_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  valueAmount: string | null;

  @Column({
    name: 'value_percent',
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  valuePercent: string | null;

  /**
   * First payroll date this row applies to.
   *
   * Without it a slab table could hold only one version of a state's rates, so
   * a mid-year PT revision either overwrote history — recomputing an old month
   * produced the new figure — or sat alongside the old rows with nothing to
   * choose between them. Rows that existed before this column was added are
   * backfilled with their own created_at, which is the only honest date
   * available: it is when the rate entered the system.
   */
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  /** Last date this row applies to; NULL means it is still current. */
  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
