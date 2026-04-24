import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('helpdesk_message_files')
@Index('idx_hmf_message', ['messageId'])
export class HelpdeskMessageFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'message_id' })
  messageId: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName: string;

  @Column({ type: 'text', name: 'file_path' })
  filePath: string;

  @Column({ type: 'varchar', length: 120, name: 'file_type' })
  fileType: string;

  @Column({ type: 'bigint', name: 'file_size' })
  fileSize: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
