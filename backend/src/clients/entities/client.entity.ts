
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

  @Entity({ name: 'clients' })
  export class ClientEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'client_code', type: 'varchar', length: 30, unique: true })
    clientCode: string;

    @Column({ name: 'client_name', type: 'varchar', length: 255 })
    clientName: string;

    @Column({ name: 'status', type: 'varchar', length: 30, nullable: true })
    status: string | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({ name: 'is_deleted', type: 'boolean', default: false })
    isDeleted: boolean;

    @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt: Date | null;

    @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
    deletedBy: string | null;

    @Column({ name: 'delete_reason', type: 'text', nullable: true })
    deleteReason: string | null;

    @Column({ name: 'assigned_crm_id', type: 'uuid', nullable: true })
    assignedCrmId: string | null;

    @Column({ name: 'assigned_auditor_id', type: 'uuid', nullable: true })
    assignedAuditorId: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
  }
