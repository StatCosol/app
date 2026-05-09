import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Frequency } from '../../common/enums';

@Entity({ name: 'compliance_master', schema: 'public' })
export class ComplianceMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 120 })
  code: string;

  @Column({ name: 'compliance_name' })
  complianceName: string;

  @Column({ name: 'law_name' })
  lawName: string;

  // Group compliances by law family for applicability rules (e.g., FACTORY_ACT, SHOPS_ESTABLISHMENTS, LABOUR_CODE)
  @Column({ name: 'law_family', type: 'varchar', length: 50, nullable: true })
  lawFamily: string | null;

  // Comma-separated state codes (e.g., "TS,KA") or 'ALL'
  @Column({ name: 'state_scope', type: 'varchar', length: 100, nullable: true })
  stateScope: string | null;

  // Optional headcount thresholds for applicability
  @Column({ name: 'min_headcount', type: 'int', nullable: true })
  minHeadcount: number | null;

  @Column({ name: 'max_headcount', type: 'int', nullable: true })
  maxHeadcount: number | null;

  @Column({ name: 'frequency', type: 'enum', enum: Frequency })
  frequency: Frequency;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
