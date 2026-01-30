import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { NotificationTemplate } from './notification-template.entity';

export interface VariableConfig {
  source: 'METRIC' | 'STATIC' | 'DATE_FORMAT';
  metricKey?: string; // e.g., 'pcn_approved_today'
  staticValue?: string;
  dateFormat?: string; // e.g., 'DD/MM/YYYY'
}

@Entity('scheduled_notifications')
@Index(['enabled'])
@Index(['nextRunAt'])
export class ScheduledNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column()
  cronSchedule: string; // "0 13 * * 1-5"

  @Column('uuid')
  templateId: string;

  @ManyToOne(() => NotificationTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: NotificationTemplate;

  @Column({ type: 'simple-array' })
  recipientIds: string[]; // Array of NotificationRecipient IDs

  @Column({ type: 'jsonb' })
  variableConfig: Record<string, VariableConfig>;

  @Column({ type: 'varchar', nullable: true })
  siteId: string | null; // Scope to specific site, null = all sites

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  nextRunAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
