import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ActionType {
  MONDAY_UPDATE = 'MONDAY_UPDATE',
}

export interface MondayColumnMapping {
  columnId: string;
  metricKey: string;
}

export interface MondayActionConfig {
  boardId: number;
  itemId?: number;
  columnMappings: MondayColumnMapping[];
}

@Entity('scheduled_actions')
@Index(['actionType'])
@Index(['enabled'])
@Index(['nextRunAt'])
export class ScheduledAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ActionType,
  })
  actionType: ActionType;

  @Column()
  cronSchedule: string;

  @Column({ type: 'jsonb' })
  config: MondayActionConfig;

  @Column({ type: 'varchar', nullable: true })
  siteId: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  nextRunAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  lastRunResult: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
