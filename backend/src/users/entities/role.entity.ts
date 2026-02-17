import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // ADMIN, CEO, CCO, CRM, AUDITOR, CLIENT, CONTRACTOR

  @Column()
  name: string;
}
