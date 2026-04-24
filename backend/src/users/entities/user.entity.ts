import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
  ManyToOne,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { ClientEntity } from '../../clients/entities/client.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_USERS_ROLEID')
  @Column({ type: 'uuid', name: 'role_id' })
  roleId: string;

  @Column({ name: 'user_code', type: 'varchar', length: 30 })
  userCode: string;

  // Legacy denormalized role code column.
  // Some environments do not have this physical column anymore, so keep it
  // non-selected/non-mutating to avoid runtime query failures.
  @Column({
    name: 'role',
    type: 'varchar',
    length: 50,
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  role: string | null;

  @Column()
  name: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Index('IDX_USERS_MOBILE')
  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    name: 'user_type',
    type: 'varchar',
    length: 10,
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  userType: string | null; // 'MASTER' | 'BRANCH' | null (non-CLIENT users)

  @Index('IDX_USERS_CLIENTID')
  @Column({ type: 'uuid', nullable: true, name: 'client_id' })
  clientId: string | null;

  @ManyToOne(() => ClientEntity)
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  // Owner CCO for CRM users (nullable for other roles)
  @Column({ name: 'owner_cco_id', type: 'uuid', nullable: true })
  ownerCcoId: string | null;

  // Link to employees table for EMPLOYEE role (ESS)
  @Index('IDX_USERS_EMPLOYEEID')
  @Column({
    name: 'employee_id',
    type: 'uuid',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  employeeId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({
    name: 'last_login_at',
    type: 'timestamptz',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  lastLoginAt: Date | null;

  @ManyToMany(() => BranchEntity, { cascade: false })
  @JoinTable({
    name: 'user_branches',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'branch_id', referencedColumnName: 'id' },
  })
  branches?: BranchEntity[];
}
