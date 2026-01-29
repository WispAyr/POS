import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Alarm } from './alarm.entity';
import { NotificationChannel, NotificationStatus } from './alarm.enums';

@Entity('alarm_notifications')
@Index(['alarmId'])
@Index(['userId', 'status'])
@Index(['status', 'createdAt'])
@Index(['channel', 'status'])
export class AlarmNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  alarmId: string;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
  })
  channel: NotificationChannel;

  @Column({ type: 'varchar', nullable: true })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  recipient: string; // email address or phone number

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @ManyToOne(() => Alarm, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alarmId' })
  alarm: Alarm;

  @CreateDateColumn()
  createdAt: Date;
}
