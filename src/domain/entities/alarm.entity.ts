import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AlarmDefinition } from './alarm-definition.entity';
import { AlarmStatus, AlarmSeverity } from './alarm.enums';

@Entity('alarms')
@Index(['status', 'triggeredAt'])
@Index(['definitionId', 'status'])
@Index(['siteId', 'status'])
@Index(['triggeredAt'])
export class Alarm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  definitionId: string;

  @Column({
    type: 'enum',
    enum: AlarmStatus,
    default: AlarmStatus.TRIGGERED,
  })
  status: AlarmStatus;

  @Column({
    type: 'enum',
    enum: AlarmSeverity,
  })
  severity: AlarmSeverity;

  @Column({ type: 'varchar', nullable: true })
  siteId: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @Column({ type: 'timestamp' })
  triggeredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  acknowledgedBy: string | null;

  @Column({ type: 'text', nullable: true })
  acknowledgeNotes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'text', nullable: true })
  resolveNotes: string | null;

  @ManyToOne(() => AlarmDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'definitionId' })
  definition: AlarmDefinition;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
