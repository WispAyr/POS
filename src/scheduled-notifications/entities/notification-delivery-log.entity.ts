import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('notification_delivery_logs')
@Index(['scheduledNotificationId'])
@Index(['recipientId'])
@Index(['status'])
@Index(['createdAt'])
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  scheduledNotificationId: string;

  @Column('uuid')
  recipientId: string;

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  @Column({ type: 'text', nullable: true })
  renderedMessage: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  error: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
