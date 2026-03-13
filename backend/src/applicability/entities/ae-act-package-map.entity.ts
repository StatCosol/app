import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_act_package_map')
@Index('UQ_AE_ACT_PKG', ['actCode', 'packageCode'], { unique: true })
export class AeActPackageMapEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'act_code', type: 'varchar', length: 50 })
  actCode: string;

  @Column({ name: 'package_code', type: 'varchar', length: 80 })
  packageCode: string;
}
