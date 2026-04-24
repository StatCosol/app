import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('cron_execution_logs')
@Index('IDX_CRON_LOG_JOB', ['jobName'])
@Index('IDX_CRON_LOG_STARTED', ['startedAt'])
export class CronExecutionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  jobName: string;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'RUNNING',
  })
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';

  @Column({ type: 'int', default: 0 })
  itemsProcessed: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
