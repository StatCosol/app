import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClraContractor } from './clra-contractor.entity';
import { ClraPeEstablishment } from './clra-pe-establishment.entity';
import { ClraWorkerDeployment } from './clra-worker-deployment.entity';
import { ClraWagePeriod } from './clra-wage-period.entity';

@Entity({ name: 'clra_contractor_assignments' })
@Index('IDX_CLRA_CA_CONTRACTOR', ['contractorId'])
@Index('IDX_CLRA_CA_PE', ['peEstablishmentId'])
@Index('IDX_CLRA_CA_STATUS', ['status'])
export class ClraContractorAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contractor_id', type: 'uuid' })
  contractorId: string;

  @Column({ name: 'pe_establishment_id', type: 'uuid' })
  peEstablishmentId: string;

  @Column({ name: 'assignment_code', length: 120, unique: true })
  assignmentCode: string;

  @Column({ name: 'contract_no', type: 'varchar', length: 150, nullable: true })
  contractNo: string | null;

  @Column({
    name: 'work_order_no',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  workOrderNo: string | null;

  @Column({ name: 'nature_of_work', length: 255 })
  natureOfWork: string;

  @Column({
    name: 'work_location_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  workLocationName: string | null;

  @Column({ name: 'work_location_address', type: 'text', nullable: true })
  workLocationAddress: string | null;

  @Column({ name: 'state_code', length: 10 })
  stateCode: string;

  @Column({ name: 'licence_no', type: 'varchar', length: 150, nullable: true })
  licenceNo: string | null;

  @Column({ name: 'licence_valid_from', type: 'date', nullable: true })
  licenceValidFrom: string | null;

  @Column({ name: 'licence_valid_to', type: 'date', nullable: true })
  licenceValidTo: string | null;

  @Column({ name: 'maximum_workmen', type: 'int', nullable: true })
  maximumWorkmen: number | null;

  @Column({ name: 'wage_period_type', length: 30, default: 'MONTHLY' })
  wagePeriodType: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ length: 30, default: 'ACTIVE' })
  status: string;

  @ManyToOne(() => ClraContractor, (c) => c.assignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'contractor_id' })
  contractor: ClraContractor;

  @ManyToOne(() => ClraPeEstablishment, (p) => p.assignments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'pe_establishment_id' })
  peEstablishment: ClraPeEstablishment;

  @OneToMany(() => ClraWorkerDeployment, (d) => d.assignment)
  deployments: ClraWorkerDeployment[];

  @OneToMany(() => ClraWagePeriod, (p) => p.assignment)
  wagePeriods: ClraWagePeriod[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
