import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_fnf_events' })
export class PayrollFnfEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fnf_id', type: 'uuid' })
  fnfId: string;

  @Column({ name: 'status_from', type: 'varchar', length: 30, nullable: true })
  statusFrom: string | null;

  @Column({ name: 'status_to', type: 'varchar', length: 30 })
  statusTo: string;

  @Column({
    name: 'action',
    type: 'varchar',
    length: 40,
    default: 'STATUS_UPDATE',
  })
  action: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({
    name: 'settlement_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  settlementAmount: string | null;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
