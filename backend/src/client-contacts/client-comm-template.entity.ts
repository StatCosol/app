import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ClientCommType = 'PAYROLL_INPUT_REQUEST' | 'MCD_REQUEST';

export const CLIENT_COMM_TYPES: ClientCommType[] = [
  'PAYROLL_INPUT_REQUEST',
  'MCD_REQUEST',
];

@Entity({ name: 'client_comm_templates' })
export class ClientCommTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'comm_type', type: 'varchar', length: 40, unique: true })
  commType: ClientCommType;

  @Column({ name: 'subject_template', type: 'text' })
  subjectTemplate: string;

  @Column({ name: 'body_template', type: 'text' })
  bodyTemplate: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
