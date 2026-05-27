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
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { ContractorMcdRowEntity } from './contractor-mcd-row.entity';

export type ContractorMcdUploadStatus = 'COMPLIANT' | 'MISMATCH' | 'ERROR';

@Entity({ name: 'contractor_mcd_uploads' })
@Index('IDX_MCD_UPLOAD_CLIENT_CONTRACTOR', ['clientId', 'contractorUserId'])
@Index('IDX_MCD_UPLOAD_PERIOD', ['periodMonth'])
export class ContractorMcdUploadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity | null;

  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contractor_user_id' })
  contractor?: UserEntity;

  @Column({ name: 'period_month', type: 'varchar', length: 7 })
  periodMonth: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'COMPLIANT' })
  status: ContractorMcdUploadStatus;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'matched_rows', type: 'int', default: 0 })
  matchedRows: number;

  @Column({ name: 'mismatch_rows', type: 'int', default: 0 })
  mismatchRows: number;

  @Column({ name: 'error_rows', type: 'int', default: 0 })
  errorRows: number;

  @Column({ name: 'notification_id', type: 'uuid', nullable: true })
  notificationId: string | null;

  @OneToMany(() => ContractorMcdRowEntity, (row) => row.upload)
  rows?: ContractorMcdRowEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
