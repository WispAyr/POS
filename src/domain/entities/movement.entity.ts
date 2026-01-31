import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('movements')
@Index(['vrm', 'timestamp'])
@Index(['siteId', 'timestamp'])
export class Movement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  siteId: string; // Foreign key reference managed manually or via relation

  @Column()
  vrm: string;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column()
  cameraIds: string; // Comma separated or single ID

  @Column({ type: 'varchar', nullable: true })
  direction: string; // 'ENTRY', 'EXIT', etc. Derived from Site Config.

  @Column({ type: 'jsonb', nullable: true })
  images: {
    url: string; // or path
    type: 'plate' | 'overview' | 'context';
    timestamp?: Date;
    camera?: string;
  }[];

  @Column({ type: 'jsonb' })
  rawData: any; // Immutable original record

  @Column({ type: 'boolean', default: false })
  requiresReview: boolean; // Flag for plates needing human review

  @Column({ type: 'boolean', default: false })
  discarded: boolean; // Flag for manually discarded movements

  @Column({ type: 'varchar', nullable: true })
  discardReason: string | null; // Reason for discard

  @Column({ type: 'timestamp', nullable: true })
  discardedAt: Date | null;

  // Hailo AI validation fields
  @Column({ type: 'boolean', nullable: true })
  hailoValidated: boolean | null; // null = not checked, true = vehicle found, false = no vehicle

  @Column({ type: 'int', nullable: true })
  hailoVehicleCount: number | null; // Number of vehicles detected

  @Column({ type: 'float', nullable: true })
  hailoConfidence: number | null; // Highest vehicle confidence score

  @Column({ type: 'jsonb', nullable: true })
  hailoResult: {
    checkedAt: Date;
    inferenceTimeMs?: number;
    detections?: Array<{
      class: string;
      confidence: number;
    }>;
    error?: string;
  } | null;

  @CreateDateColumn()
  ingestedAt: Date;
}
