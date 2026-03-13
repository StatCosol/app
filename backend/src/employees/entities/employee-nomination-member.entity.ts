import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'employee_nomination_members' })
export class EmployeeNominationMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'nomination_id', type: 'uuid' })
  nominationId: string;

  @Column({ name: 'member_name', type: 'varchar', length: 200 })
  memberName: string;

  @Column({ name: 'relationship', type: 'varchar', length: 60, nullable: true })
  relationship: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({
    name: 'share_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  sharePct: string;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'is_minor', type: 'boolean', default: false })
  isMinor: boolean;

  @Column({
    name: 'guardian_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  guardianName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
