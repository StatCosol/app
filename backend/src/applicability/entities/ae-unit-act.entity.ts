import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_unit_act')
@Index('UQ_AE_UNIT_ACT', ['unitId', 'actCode'], { unique: true })
export class AeUnitActEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'act_code', type: 'varchar', length: 50 })
  actCode: string;

  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'enabled_at', type: 'timestamptz', nullable: true })
  enabledAt: Date | null;

  @Column({ name: 'enabled_by', type: 'uuid', nullable: true })
  enabledBy: string | null;
}
