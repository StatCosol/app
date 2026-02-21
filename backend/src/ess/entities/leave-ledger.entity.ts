import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'leave_ledger' })
export class LeaveLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'leave_type', type: 'varchar', length: 30 })
  leaveType: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate: string;

  @Column({
    name: 'qty',
    type: 'numeric',
    precision: 5,
    scale: 2,
  })
  qty: string;

  @Column({ name: 'ref_type', type: 'varchar', length: 30 })
  refType: string;

  @Column({ name: 'ref_id', type: 'uuid', nullable: true })
  refId: string | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
