import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  AlarmType,
  AlarmSeverity,
  NotificationChannel,
} from './alarm.enums';
import type { AlarmConditions } from './alarm.enums';

@Entity('alarm_definitions')
@Index(['type'])
@Index(['enabled'])
@Index(['siteId'])
export class AlarmDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: AlarmType,
  })
  type: AlarmType;

  @Column({
    type: 'enum',
    enum: AlarmSeverity,
    default: AlarmSeverity.WARNING,
  })
  severity: AlarmSeverity;

  @Column({ type: 'varchar', nullable: true })
  siteId: string | null; // nullable = system-wide alarm

  @Column({ type: 'jsonb' })
  conditions: AlarmConditions;

  @Column({ type: 'varchar', nullable: true })
  cronSchedule: string; // e.g., '0 3 * * *'

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'simple-array', default: 'IN_APP' })
  notificationChannels: NotificationChannel[];

  @Column({ type: 'jsonb', nullable: true })
  actions: {
    name: string;
    type: string;
    config: Record<string, any>;
    enabled: boolean;
    description?: string;
  }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
