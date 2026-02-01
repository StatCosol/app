import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
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

  @OneToMany(() => PayrollTemplateComponent, c => c.template, { cascade: true })
  components: PayrollTemplateComponent[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
