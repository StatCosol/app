import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompliancePackageEntity } from './compliance-package.entity';
import { UnitComplianceMasterEntity } from './unit-compliance-master.entity';

@Entity({ name: 'package_compliance' })
@Index(['packageId', 'complianceId'], { unique: true })
export class PackageComplianceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @ManyToOne(() => CompliancePackageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'package_id' })
  package: CompliancePackageEntity;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;

  @ManyToOne(() => UnitComplianceMasterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compliance_id' })
  compliance: UnitComplianceMasterEntity;

  @Column({ name: 'included_by_default', type: 'boolean', default: true })
  includedByDefault: boolean;
}
