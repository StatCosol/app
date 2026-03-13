import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';
import { Periodicity } from './enums';

@Entity('ae_compliance_master')
@Unique('UQ_AE_COMPL_MASTER_CODE', ['code'])
export class AeComplianceMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'code', type: 'varchar', length: 80 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 500 })
  name: string;

  @Index()
  @Column({ name: 'labour_code', type: 'varchar', length: 30 })
  labourCode: string; // WAGES / SS / IR / OSH

  @Index()
  @Column({ name: 'group_code', type: 'varchar', length: 80, nullable: true })
  groupCode: string | null; // OSH/BOCW, SS/PF, etc.

  @Column({ name: 'periodicity', type: 'varchar', length: 20 })
  periodicity: Periodicity;

  @Column({ name: 'evidence_schema', type: 'jsonb', nullable: true })
  evidenceSchema: Record<string, any> | null;

  @Column({ name: 'task_template', type: 'jsonb', nullable: true })
  taskTemplate: Record<string, any> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
