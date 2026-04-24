import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_client_settings' })
export class PayrollClientSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'client_id', unique: true })
  clientId: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: Record<string, any>;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
