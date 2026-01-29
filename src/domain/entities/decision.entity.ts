import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

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

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
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

  @Column({ nullable: true })
  operatorId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  params: any;

  @CreateDateColumn()
  createdAt: Date;
}
