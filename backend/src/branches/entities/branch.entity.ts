import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToMany,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('client_branches')
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_code', type: 'varchar', length: 50, unique: true })
  branchCode: string;

  @Index('IDX_BRANCHES_CLIENTID')
  @Column({ name: 'clientid', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branchname', type: 'character varying', nullable: true })
  branchName: string | null;

  @Column({ name: 'branchtype', type: 'character varying' })
  branchType: string;

  @Column({
    name: 'statecode',
    type: 'character varying',
    length: 10,
    nullable: true,
  })
  stateCode: string | null;

  @Column({
    name: 'establishment_type',
    type: 'character varying',
    length: 30,
    default: 'BRANCH',
  })
  establishmentType: string;

  @Column({ name: 'city', type: 'character varying', nullable: true })
  city: string | null;

  @Column({ name: 'pincode', type: 'character varying', nullable: true })
  pincode: string | null;

  @Column({ name: 'headcount', type: 'int', default: 0 })
  headcount: number;

  @Column({ name: 'address', type: 'text' })
  address: string;

  @Column({ name: 'employeecount', type: 'int', default: 0 })
  employeeCount: number;

  @Column({ name: 'contractorcount', type: 'int', default: 0 })
  contractorCount: number;

  @Column({ name: 'status', type: 'character varying', default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ name: 'createdat', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedat', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'isactive', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'isdeleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ name: 'deletedat', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deletedby', type: 'uuid', nullable: true })
  deletedBy: string | null;

  @Column({ name: 'deletereason', type: 'text', nullable: true })
  deleteReason: string | null;

  @ManyToMany(() => UserEntity, (u) => u.branches)
  users?: UserEntity[];
}
