import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Extended statutory details for an employee.
 * The employees table already stores basic uan/esic flags, but this
 * table holds the richer PF member-ID, ESI IP number, dispensary,
 * join dates, and nominee-level meta that the ESS portal needs.
 */
@Entity({ name: 'employee_statutory' })
@Index(['employeeId'], { unique: true })
export class EmployeeStatutoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  // ── PF ────────────────────────────────────────────────
  @Column({ name: 'pf_uan', type: 'varchar', length: 30, nullable: true })
  pfUan: string | null;

  @Column({ name: 'pf_member_id', type: 'varchar', length: 30, nullable: true })
  pfMemberId: string | null;

  @Column({ name: 'pf_join_date', type: 'date', nullable: true })
  pfJoinDate: string | null;

  @Column({ name: 'pf_exit_date', type: 'date', nullable: true })
  pfExitDate: string | null;

  @Column({
    name: 'pf_wages',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  pfWages: string | null;

  // ── ESI ───────────────────────────────────────────────
  @Column({
    name: 'esi_ip_number',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  esiIpNumber: string | null;

  @Column({
    name: 'esi_dispensary',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  esiDispensary: string | null;

  @Column({ name: 'esi_join_date', type: 'date', nullable: true })
  esiJoinDate: string | null;

  @Column({ name: 'esi_exit_date', type: 'date', nullable: true })
  esiExitDate: string | null;

  @Column({
    name: 'esi_wages',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  esiWages: string | null;

  // ── Professional Tax ──────────────────────────────────
  @Column({
    name: 'pt_registration_number',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  ptRegistrationNumber: string | null;

  // ── LWF ───────────────────────────────────────────────
  @Column({ name: 'lwf_applicable', type: 'boolean', default: false })
  lwfApplicable: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
