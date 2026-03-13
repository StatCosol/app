import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { ComplianceSource } from './enums';

@Entity('ae_unit_compliance')
@Index('UQ_AE_UNIT_COMPL', ['unitId', 'complianceId'], { unique: true })
export class AeUnitComplianceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;

  @Column({ name: 'is_applicable', type: 'boolean', default: true })
  isApplicable: boolean;

  @Column({ name: 'source', type: 'varchar', length: 30 })
  source: ComplianceSource;

  @Column({ name: 'locked', type: 'boolean', default: true })
  locked: boolean;

  @Column({ name: 'explain_json', type: 'jsonb', default: () => "'{}'" })
  explainJson: Record<string, any>;

  @Column({ name: 'computed_at', type: 'timestamptz', default: () => 'now()' })
  computedAt: Date;
}
