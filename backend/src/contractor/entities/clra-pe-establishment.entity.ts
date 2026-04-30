import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClraContractorAssignment } from './clra-contractor-assignment.entity';

@Entity({ name: 'clra_pe_establishments' })
@Index('IDX_CLRA_PE_CLIENT', ['clientId'])
@Index('IDX_CLRA_PE_BRANCH', ['branchId'])
export class ClraPeEstablishment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'pe_name', length: 255 })
  peName: string;

  @Column({ name: 'establishment_name', length: 255 })
  establishmentName: string;

  @Column({
    name: 'establishment_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  establishmentCode: string | null;

  @Column({
    name: 'registration_certificate_no',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  registrationCertificateNo: string | null;

  @Column({
    name: 'address_line1',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressLine1: string | null;

  @Column({
    name: 'address_line2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressLine2: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  district: string | null;

  @Column({ name: 'state_code', length: 10 })
  stateCode: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pincode: string | null;

  @Column({ name: 'unit_type', length: 50, default: 'FACTORY' })
  unitType: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => ClraContractorAssignment, (a) => a.peEstablishment)
  assignments: ClraContractorAssignment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
