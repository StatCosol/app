import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'employee_sequence' })
@Index(['clientId', 'stateCode', 'branchCode', 'year'], { unique: true })
export class EmployeeSequenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'state_code', type: 'varchar', length: 10 })
  stateCode: string;

  @Column({ name: 'branch_code', type: 'varchar', length: 10 })
  branchCode: string;

  @Column({ name: 'year', type: 'int' })
  year: number;

  @Column({ name: 'last_seq', type: 'int', default: 0 })
  lastSeq: number;
}
