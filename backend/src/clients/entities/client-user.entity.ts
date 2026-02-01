import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ClientEntity } from './client.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('client_users')
@Index('uq_client_users_client_user', ['clientId', 'userId'], { unique: true })
export class ClientUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ✅ map to snake_case column
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity;

  // ✅ map to snake_case column
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', nullable: true })
  createdAt: Date | null;
}
