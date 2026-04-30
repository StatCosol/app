import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BranchEntity } from './branch.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('branch_contractor')
@Index(
  'UQ_branch_contractor_client_branch_contractor',
  ['clientId', 'branchId', 'contractorUserId'],
  { unique: true },
)
@Index('IDX_branch_contractor_client', ['clientId'])
@Index('IDX_branch_contractor_branch', ['branchId'])
@Index('IDX_branch_contractor_contractor', ['contractorUserId'])
export class BranchContractorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => BranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: BranchEntity;

  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contractor_user_id' })
  contractor: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
