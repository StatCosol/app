import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PayrollTemplateComponent } from './payroll-template-component.entity';

@Entity('payroll_templates')
export class PayrollTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ default: 1 })
  version: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ name: 'file_name', type: 'varchar', length: 300 })
  fileName: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'file_type', type: 'varchar', length: 150, nullable: true })
  fileType: string | null;

  @OneToMany(() => PayrollTemplateComponent, (c) => c.template, {
    cascade: true,
  })
  components: PayrollTemplateComponent[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
