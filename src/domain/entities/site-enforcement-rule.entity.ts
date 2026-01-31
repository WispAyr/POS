import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Site } from './site.entity';

export enum EnforcementRuleType {
  DISABLE_ENFORCEMENT = 'DISABLE_ENFORCEMENT', // No PCN candidates generated
  PAUSE_ENFORCEMENT = 'PAUSE_ENFORCEMENT', // Temporarily paused
  REDUCED_ENFORCEMENT = 'REDUCED_ENFORCEMENT', // Future: for partial rules
}

@Entity('site_enforcement_rules')
export class SiteEnforcementRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'site_id' })
  siteId: string;

  @ManyToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({
    type: 'enum',
    enum: EnforcementRuleType,
    default: EnforcementRuleType.DISABLE_ENFORCEMENT,
  })
  ruleType: EnforcementRuleType;

  @Column({ type: 'timestamp', name: 'start_date' })
  startDate: Date;

  @Column({ type: 'timestamp', name: 'end_date', nullable: true })
  endDate: Date | null; // NULL = indefinite (currently active)

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Helper to check if rule applies to a given timestamp
  appliesTo(timestamp: Date): boolean {
    if (!this.active) return false;
    if (timestamp < this.startDate) return false;
    if (this.endDate && timestamp > this.endDate) return false;
    return true;
  }
}
