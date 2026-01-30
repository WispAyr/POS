import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Session } from './session.entity';

export enum DecisionOutcome {
  COMPLIANT = 'COMPLIANT',
  ENFORCEMENT_CANDIDATE = 'ENFORCEMENT_CANDIDATE',
  PASS_THROUGH = 'PASS_THROUGH',
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
  CANCELLED = 'CANCELLED',
}

@Entity('decisions')
export class Decision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string | null;

  @ManyToOne(() => Session, { nullable: true })
  @JoinColumn({ name: 'sessionId' })
  session?: Session;

  @Column({ type: 'uuid', nullable: true })
  movementId: string | null;

  @Column({
    type: 'enum',
    enum: DecisionOutcome,
  })
  outcome: DecisionOutcome;

  @Column({ default: 'NEW' })
  status: string; // 'NEW', 'CANDIDATE', 'APPROVED', 'DECLINED', 'EXPORTED'

  @Column()
  ruleApplied: string; // e.g., 'PAYMENT_VALID', 'OVERSTAY'

  @Column('text')
  rationale: string;

  @Column({ default: false })
  isOperatorOverride: boolean;

  @Column({ type: 'varchar', nullable: true })
  operatorId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  params: any;

  @CreateDateColumn()
  createdAt: Date;
}
