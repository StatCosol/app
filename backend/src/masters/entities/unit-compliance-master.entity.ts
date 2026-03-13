import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ComplianceCategory =
  | 'LABOUR_CODE'
  | 'STATE_RULE'
  | 'SAFETY'
  | 'SPECIAL_ACT'
  | 'LICENSE'
  | 'RETURN';

export type AppliesTo = 'FACTORY' | 'ESTABLISHMENT' | 'BOTH';

export type ComplianceFrequency =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'ANNUAL'
  | 'EVENT_BASED'
  | 'ON_DEMAND';

@Entity({ name: 'unit_compliance_master' })
export class UnitComplianceMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: 'LABOUR_CODE' })
  category: ComplianceCategory;

  @Column({ name: 'state_code', type: 'text', nullable: true })
  stateCode: string | null;

  @Column({ type: 'text', default: 'MONTHLY' })
  frequency: ComplianceFrequency;

  @Column({ name: 'applies_to', type: 'text', default: 'BOTH' })
  appliesTo: AppliesTo;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
