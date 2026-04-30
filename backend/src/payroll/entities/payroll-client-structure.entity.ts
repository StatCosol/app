import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PayrollStructureComponentEntity } from './payroll-structure-component.entity';
import { PayrollStatutoryConfigEntity } from './payroll-statutory-config.entity';

@Entity('payroll_client_structures')
@Index(['clientId', 'code', 'version'], { unique: true })
export class PayrollClientStructureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'code', type: 'varchar', length: 60 })
  code: string;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @OneToMany(() => PayrollStructureComponentEntity, (c) => c.structure, {
    cascade: true,
  })
  components: PayrollStructureComponentEntity[];

  @OneToMany(() => PayrollStatutoryConfigEntity, (s) => s.structure, {
    cascade: true,
  })
  statutoryConfigs: PayrollStatutoryConfigEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
