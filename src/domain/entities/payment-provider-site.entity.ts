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
import { PaymentProvider } from './payment-provider.entity';
import type { SiteMappingConfig } from './payment-provider.types';

@Entity('payment_provider_sites')
@Index(['providerId', 'siteId'], { unique: true })
@Index(['siteId'])
@Index(['active'])
export class PaymentProviderSite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  providerId: string;

  @Column()
  siteId: string;

  @Column({ type: 'jsonb', nullable: true })
  siteMapping: SiteMappingConfig | null;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => PaymentProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: PaymentProvider;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
