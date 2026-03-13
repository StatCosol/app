import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sla_compliance_items')
export class SlaComplianceItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string; // MCD_UPLOAD, PF_PAYMENT, ESI_PAYMENT, PT_PAYMENT …

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 30 })
  module: string; // MCD, RETURNS, REGISTRATION, AUDIT …

  @Column({ type: 'varchar', length: 20, default: 'MONTHLY' })
  frequency: string; // MONTHLY / QUARTERLY / ANNUAL / ONE_TIME

  @Column({
    name: 'default_priority',
    type: 'varchar',
    length: 15,
    default: 'MEDIUM',
  })
  defaultPriority: string;

  @Column({ name: 'default_sla_days', type: 'int', default: 5 })
  defaultSlaDays: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
