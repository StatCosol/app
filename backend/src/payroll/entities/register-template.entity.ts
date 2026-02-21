import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'register_templates' })
@Index(['stateCode', 'establishmentType', 'registerType'], { unique: true })
export class RegisterTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'state_code', type: 'varchar', length: 10 })
  stateCode: string;

  @Column({ name: 'establishment_type', type: 'varchar', length: 30, default: 'FACTORY' })
  establishmentType: string;

  @Column({ name: 'register_type', type: 'varchar', length: 60 })
  registerType: string; // FORM_A, FORM_B, REGISTER_WAGES, etc.

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'template_file_path', type: 'text', nullable: true })
  templateFilePath: string | null;

  @Column({ name: 'column_definitions', type: 'jsonb', default: () => "'[]'::jsonb" })
  columnDefinitions: any[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
