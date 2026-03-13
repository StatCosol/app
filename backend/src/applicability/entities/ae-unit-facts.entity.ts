import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('ae_unit_facts')
@Index('UQ_AE_UNIT_FACTS_UNIT', ['unitId'], { unique: true })
export class AeUnitFactsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'uuid' })
  unitId: string;

  @Column({ name: 'facts_json', type: 'jsonb', default: () => "'{}'" })
  factsJson: Record<string, any>;

  @Column({ name: 'facts_version', type: 'int', default: 1 })
  factsVersion: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
