import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { BranchEntity } from '../../branches/entities/branch.entity';

@Entity('users')
export class UserEntity {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_USERS_ROLEID')
  @Column({ type: 'uuid', name: 'role_id' })
  roleId: string;

  @Column({ name: 'user_code', type: 'varchar', length: 30 })
  userCode: string;

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

  @Index('IDX_USERS_CLIENTID')
  @Column({ type: 'uuid', nullable: true, name: 'client_id' })
  clientId: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  // Owner CCO for CRM users (nullable for other roles)
  @Column({ name: 'owner_cco_id', type: 'uuid', nullable: true })
  ownerCcoId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToMany(() => BranchEntity, { cascade: false })
  @JoinTable({
    name: 'user_branches',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'branch_id', referencedColumnName: 'id' },
  })
  branches?: BranchEntity[];
}
