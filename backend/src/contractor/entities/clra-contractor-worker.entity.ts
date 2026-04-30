import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ClraContractor } from './clra-contractor.entity';
import { ClraWorkerDeployment } from './clra-worker-deployment.entity';

@Entity({ name: 'clra_contractor_workers' })
@Unique('UQ_CLRA_CW_CODE', ['contractorId', 'workerCode'])
@Index('IDX_CLRA_CW_CONTRACTOR', ['contractorId'])
export class ClraContractorWorker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contractor_id', type: 'uuid' })
  contractorId: string;

  @Column({ name: 'worker_code', length: 100 })
  workerCode: string;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({
    name: 'father_or_spouse_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  fatherOrSpouseName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({
    name: 'aadhaar_masked',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  aadhaarMasked: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  uan: string | null;

  @Column({ name: 'esi_no', type: 'varchar', length: 50, nullable: true })
  esiNo: string | null;

  @Column({
    name: 'bank_account_masked',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  bankAccountMasked: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  mobile: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'date_of_joining', type: 'date', nullable: true })
  dateOfJoining: string | null;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => ClraContractor, (c) => c.workers, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contractor_id' })
  contractor: ClraContractor;

  @OneToMany(() => ClraWorkerDeployment, (d) => d.worker)
  deployments: ClraWorkerDeployment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
