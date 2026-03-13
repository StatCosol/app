import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'compliance_package' })
export class CompliancePackageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'state_code', type: 'text', nullable: true })
  stateCode: string | null;

  @Column({ name: 'applies_to', type: 'text', nullable: true })
  appliesTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
