import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';
import { UnitType } from './enums';

@Entity('ae_package_master')
@Unique('UQ_AE_PKG_MASTER_CODE', ['code'])
export class AePackageMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'code', type: 'varchar', length: 80 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'scope', type: 'varchar', length: 20 })
  scope: UnitType;
}
