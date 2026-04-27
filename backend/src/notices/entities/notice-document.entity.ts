import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { NoticeEntity } from './notice.entity';
import { UserEntity } from '../../users/entities/user.entity';

export type NoticeDocumentType =
  | 'NOTICE_COPY'
  | 'RESPONSE_DRAFT'
  | 'RESPONSE_FINAL'
  | 'SUPPORTING'
  | 'CLOSURE_PROOF'
  | 'OTHER';

@Entity('notice_documents')
@Index('IDX_NOTICEDOC_NOTICE', ['noticeId'])
export class NoticeDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notice_id', type: 'uuid' })
  noticeId: string;

  @ManyToOne(() => NoticeEntity, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notice_id' })
  notice?: NoticeEntity;

  @Column({
    name: 'document_type',
    type: 'varchar',
    length: 30,
    default: 'NOTICE_COPY',
  })
  documentType: NoticeDocumentType;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_url', type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy?: UserEntity;

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt: Date;
}
