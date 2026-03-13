import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_unit_compliance_override')
@Index('UQ_AE_UNIT_COMPL_OVR', ['unitId', 'complianceId'], { unique: true })
export class AeUnitComplianceOverrideEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;

  @Column({ name: 'force_applicable', type: 'boolean', nullable: true })
  forceApplicable: boolean | null;

  @Column({ name: 'force_not_applicable', type: 'boolean', nullable: true })
  forceNotApplicable: boolean | null;

  @Column({ name: 'locked', type: 'boolean', nullable: true })
  locked: boolean | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'set_by', type: 'uuid', nullable: true })
  setBy: string | null;

  @Column({ name: 'set_at', type: 'timestamptz', default: () => 'now()' })
  setAt: Date;
}
