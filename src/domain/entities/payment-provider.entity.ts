import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  PaymentProviderType,
  SyncStatus,
} from './payment-provider.types';
import type { PaymentProviderConfig } from './payment-provider.types';

@Entity('payment_providers')
@Index(['name'], { unique: true })
@Index(['type'])
@Index(['active'])
@Index(['mondayItemId'])
export class PaymentProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: PaymentProviderType,
  })
  type: PaymentProviderType;

  @Column({ type: 'jsonb' })
  config: PaymentProviderConfig;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'varchar', nullable: true })
  mondayItemId: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  @Column({
    type: 'enum',
    enum: SyncStatus,
    nullable: true,
  })
  lastSyncStatus: SyncStatus;

  @Column({ type: 'jsonb', nullable: true })
  lastSyncDetails: {
    emailsProcessed?: number;
    recordsFound?: number;
    recordsIngested?: number;
    recordsSkipped?: number;
    recordsFailed?: number;
    errors?: string[];
    duration?: number;
  };

  @Column({ type: 'int', default: 5 })
  pollIntervalMinutes: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
