import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_query_messages' })
export class PayrollQueryMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'query_id', type: 'uuid' })
  queryId: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
