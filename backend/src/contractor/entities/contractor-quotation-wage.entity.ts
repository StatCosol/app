import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { UserEntity } from '../../users/entities/user.entity';

export type ContractorWageSkill =
  | 'UNSKILLED'
  | 'SEMI_SKILLED'
  | 'SKILLED'
  | 'HIGHLY_SKILLED';

const numericTransformer = {
  to: (v: number | null | undefined) => (v == null ? null : v),
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: 'contractor_quotation_wages' })
@Index('IDX_CQW_CLIENT_CONTRACTOR', ['clientId', 'contractorUserId'])
@Index('IDX_CQW_BRANCH', ['branchId'])
@Index('IDX_CQW_SKILL_EFFECTIVE', ['skillCategory', 'effectiveFrom'])
export class ContractorQuotationWageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity | null;

  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contractor_user_id' })
  contractor?: UserEntity;

  @Column({ name: 'skill_category', type: 'varchar', length: 20 })
  skillCategory: ContractorWageSkill;

  @Column({
    name: 'daily_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  dailyWage: number;

  @Column({
    name: 'monthly_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  monthlyWage: number | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'source', type: 'varchar', length: 255, nullable: true })
  source: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
