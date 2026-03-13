import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EstablishmentType = 'FACTORY' | 'ESTABLISHMENT' | 'BOTH';

@Entity({ name: 'unit_facts' })
export class UnitFactsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'branch_id', type: 'uuid', unique: true })
  branchId: string;

  @Column({ name: 'state_code', type: 'text' })
  stateCode: string;

  @Column({
    name: 'establishment_type',
    type: 'text',
    default: 'ESTABLISHMENT',
  })
  establishmentType: EstablishmentType;

  @Column({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean;

  @Column({ name: 'industry_category', type: 'text', nullable: true })
  industryCategory: string | null;

  @Column({ name: 'employee_total', type: 'int', default: 0 })
  employeeTotal: number;

  @Column({ name: 'employee_male', type: 'int', default: 0 })
  employeeMale: number;

  @Column({ name: 'employee_female', type: 'int', default: 0 })
  employeeFemale: number;

  @Column({ name: 'contract_workers_total', type: 'int', default: 0 })
  contractWorkersTotal: number;

  @Column({ name: 'contractors_count', type: 'int', default: 0 })
  contractorsCount: number;

  @Column({ name: 'is_bocw_project', type: 'boolean', default: false })
  isBocwProject: boolean;

  @Column({ name: 'has_canteen', type: 'boolean', nullable: true })
  hasCanteen: boolean | null;

  @Column({ name: 'has_creche', type: 'boolean', nullable: true })
  hasCreche: boolean | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
