import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'leave_balances' })
@Index(['employeeId', 'year', 'leaveType'], { unique: true })
export class LeaveBalanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'year', type: 'int' })
  year: number;

  @Column({ name: 'leave_type', type: 'varchar', length: 30 })
  leaveType: string;

  @Column({
    name: 'opening',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  opening: string;

  @Column({
    name: 'accrued',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  accrued: string;

  @Column({
    name: 'used',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  used: string;

  @Column({
    name: 'lapsed',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  lapsed: string;

  @Column({
    name: 'available',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  available: string;

  @Column({ name: 'last_updated_at', type: 'timestamptz', nullable: true })
  lastUpdatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
