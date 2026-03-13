import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_unit_act_profile')
@Index('UQ_AE_UNIT_ACT_PROFILE', ['unitId', 'actCode'], { unique: true })
export class AeUnitActProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'act_code', type: 'varchar', length: 50 })
  actCode: string;

  @Column({ name: 'data_json', type: 'jsonb', default: () => "'{}'" })
  dataJson: Record<string, any>;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
