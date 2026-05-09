import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ComplianceTask } from './compliance-task.entity';
import { UserEntity } from '../../users/entities/user.entity';

export type McdItemStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'RETURNED'
  | 'APPROVED';

@Entity('compliance_mcd_items')
export class ComplianceMcdItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

  @ManyToOne(() => ComplianceTask)
  @JoinColumn({ name: 'task_id' })
  task?: ComplianceTask;

  @Column({ name: 'item_key', type: 'varchar', length: 120, nullable: true })
  itemKey: string | null;

  @Column({ name: 'item_label', type: 'text' })
  itemLabel: string;

  @Column({ name: 'unit_type', type: 'varchar', length: 60, nullable: true })
  unitType: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @Column({ name: 'required', type: 'boolean', default: true })
  required: boolean;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status: McdItemStatus;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({
    name: 'uploaded_by_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  uploadedByRole: string | null;

  @Column({ name: 'verified_by_user_id', type: 'uuid', nullable: true })
  verifiedByUserId: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'verified_by_user_id' })
  verifiedBy?: UserEntity;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
