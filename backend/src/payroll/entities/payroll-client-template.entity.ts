import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PayrollTemplate } from './payroll-template.entity';

@Entity('payroll_client_template')
export class PayrollClientTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  client_id: string;

  @ManyToOne(() => PayrollTemplate, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: PayrollTemplate;

  @Column({ type: 'date' })
  effective_from: Date;

  @Column({ type: 'date', nullable: true })
  effective_to: Date | null;
}
