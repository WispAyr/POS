import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type CustomerExportStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface CustomerExportError {
  siteId: string;
  error: string;
}

@Entity('customer_export_logs')
@Index(['status'])
@Index(['startedAt'])
@Index(['siteId'])
export class CustomerExportLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  siteId: string | null; // null = full export

  @Column({ type: 'varchar', default: 'PENDING' })
  status: CustomerExportStatus;

  @Column({ type: 'int', default: 0 })
  sitesProcessed: number;

  @Column({ type: 'int', default: 0 })
  totalWhitelistRecords: number;

  @Column({ type: 'int', default: 0 })
  totalPaymentRecords: number;

  @Column({ type: 'jsonb', nullable: true })
  errors: CustomerExportError[] | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  startedAt: Date;
}
