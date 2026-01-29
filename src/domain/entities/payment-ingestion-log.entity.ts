import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentProvider } from './payment-provider.entity';
import {
  IngestionStatus,
  AttachmentInfo,
  IngestionError,
  ParsedPaymentRecord,
} from './payment-provider.types';

@Entity('payment_ingestion_logs')
@Index(['providerId', 'createdAt'])
@Index(['emailMessageId'], { unique: true, where: '"emailMessageId" IS NOT NULL' })
@Index(['status'])
@Index(['createdAt'])
export class PaymentIngestionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  providerId: string;

  @Column()
  source: string; // 'EMAIL', 'API', 'WEBHOOK', 'FILE_DROP', 'MANUAL'

  @Column({ type: 'varchar', nullable: true })
  emailMessageId: string; // For deduplication

  @Column({ type: 'varchar', nullable: true })
  emailSubject: string;

  @Column({ type: 'varchar', nullable: true })
  emailFrom: string;

  @Column({ type: 'timestamp', nullable: true })
  emailDate: Date;

  @Column({ type: 'text', nullable: true })
  rawEmailBody: string; // Compliance requirement

  @Column({ type: 'jsonb', nullable: true })
  attachments: AttachmentInfo[];

  @Column({ type: 'jsonb', nullable: true })
  parsedData: ParsedPaymentRecord[];

  @Column({
    type: 'enum',
    enum: IngestionStatus,
    default: IngestionStatus.PENDING,
  })
  status: IngestionStatus;

  @Column({ type: 'int', default: 0 })
  recordsFound: number;

  @Column({ type: 'int', default: 0 })
  recordsIngested: number;

  @Column({ type: 'int', default: 0 })
  recordsSkipped: number;

  @Column({ type: 'int', default: 0 })
  recordsFailed: number;

  @Column({ type: 'jsonb', nullable: true })
  errors: IngestionError[];

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @ManyToOne(() => PaymentProvider, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'providerId' })
  provider: PaymentProvider;

  @CreateDateColumn()
  createdAt: Date;
}
