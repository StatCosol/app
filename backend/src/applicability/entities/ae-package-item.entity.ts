import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_package_item')
@Index('UQ_AE_PKG_ITEM', ['packageCode', 'complianceId'], { unique: true })
export class AePackageItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'package_code', type: 'varchar', length: 80 })
  packageCode: string;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;
}
