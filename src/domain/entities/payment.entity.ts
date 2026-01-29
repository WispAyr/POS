import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('payments')
@Index(['vrm', 'siteId'])
@Index(['expiryTime'])
@Index(['siteId', 'startTime', 'expiryTime']) // For active payment queries
@Index(['siteId', 'expiryTime']) // For expiring payments queries
@Index(['providerId']) // For provider-based queries
@Index(['ingestionLogId']) // For ingestion tracking
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  siteId: string;

  @Column()
  vrm: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  expiryTime: Date;

  @Column()
  source: string; // 'APP', 'KIOSK', 'TERM', 'IMPORT', 'PROVIDER'

  @Column({ type: 'varchar', nullable: true })
  externalReference: string;

  @Column({ type: 'jsonb', nullable: true })
  rawData: any;

  @Column({ type: 'uuid', nullable: true })
  providerId: string | null; // Link to PaymentProvider

  @Column({ type: 'uuid', nullable: true })
  ingestionLogId: string | null; // Link to PaymentIngestionLog

  @CreateDateColumn()
  ingestedAt: Date;
}
