import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'pay_formula_templates' })
export class PayFormulaTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL = global template available to every client. */
  @Index()
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'name', type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  /** Optional component the template is intended for (filters the picker). */
  @Index()
  @Column({ name: 'component_id', type: 'uuid', nullable: true })
  componentId: string | null;

  @Column({ name: 'formula_json', type: 'jsonb' })
  formulaJson: Record<string, unknown>;

  @Column({ name: 'formula_text', type: 'text' })
  formulaText: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
