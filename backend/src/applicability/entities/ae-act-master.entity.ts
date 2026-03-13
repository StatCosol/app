import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';
import { UnitType } from './enums';

@Entity('ae_act_master')
@Unique('UQ_AE_ACT_MASTER_CODE', ['code'])
export class AeActMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'code', type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'scope', type: 'varchar', length: 20 })
  scope: UnitType;

  @Column({ name: 'requires_profile', type: 'boolean', default: false })
  requiresProfile: boolean;

  @Column({ name: 'has_license', type: 'boolean', default: false })
  hasLicense: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
