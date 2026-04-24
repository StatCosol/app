import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClraContractorAssignment } from './clra-contractor-assignment.entity';
import { ClraContractorWorker } from './clra-contractor-worker.entity';

@Entity({ name: 'clra_contractors' })
export class ClraContractor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contractor_code', length: 100, unique: true })
  contractorCode: string;

  @Column({ name: 'legal_name', length: 255 })
  legalName: string;

  @Column({ name: 'trade_name', type: 'varchar', length: 255, nullable: true })
  tradeName: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 255, nullable: true })
  contactPerson: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  mobile: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  pan: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  gstin: string | null;

  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1: string | null;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  district: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pincode: string | null;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => ClraContractorAssignment, (a) => a.contractor)
  assignments: ClraContractorAssignment[];

  @OneToMany(() => ClraContractorWorker, (w) => w.contractor)
  workers: ClraContractorWorker[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
