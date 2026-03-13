import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';

@Entity('escalations')
export class EscalationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => BranchEntity, { eager: false })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'risk_score', type: 'int' })
  riskScore: number;

  @Column({ name: 'sla_overdue_count', type: 'int', default: 0 })
  slaOverdueCount: number;

  @Column({ name: 'status', type: 'varchar', length: 15, default: 'OPEN' })
  status: string; // OPEN/ACK/CLOSED

  @Column({ name: 'source_key', type: 'text', nullable: true })
  sourceKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
