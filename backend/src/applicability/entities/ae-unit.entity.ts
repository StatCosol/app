import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UnitType, EstablishmentType, PlantType } from './enums';

@Entity('ae_unit')
export class AeUnitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_AE_UNIT_TENANT')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'unit_type', type: 'varchar', length: 20 })
  unitType: UnitType;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'state', type: 'varchar', length: 64, nullable: true })
  state: string | null;

  @Column({
    name: 'establishment_type',
    type: 'varchar',
    length: 30,
    default: EstablishmentType.ESTABLISHMENT,
  })
  establishmentType: EstablishmentType;

  @Column({
    name: 'plant_type',
    type: 'varchar',
    length: 20,
    default: PlantType.NA,
  })
  plantType: PlantType;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Optional FK back to client_branches.id for BRANCH units */
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
