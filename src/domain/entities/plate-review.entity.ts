import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ValidationStatus {
  UK_VALID = 'UK_VALID',
  INTERNATIONAL_VALID = 'INTERNATIONAL_VALID',
  UK_SUSPICIOUS = 'UK_SUSPICIOUS',
  INTERNATIONAL_SUSPICIOUS = 'INTERNATIONAL_SUSPICIOUS',
  INVALID = 'INVALID',
}

export enum ReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  CORRECTED = 'CORRECTED',
  DISCARDED = 'DISCARDED',
}

@Entity('plate_reviews')
@Index(['reviewStatus', 'createdAt'])
@Index(['siteId', 'reviewStatus'])
@Index(['validationStatus', 'reviewStatus'])
export class PlateReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  movementId: string;

  @Column({ type: 'varchar', length: 20 })
  originalVrm: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  normalizedVrm: string;

  @Column({ type: 'varchar', length: 50 })
  siteId: string;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  confidence: number;

  @Column({ type: 'simple-array' })
  suspicionReasons: string[];

  @Column({
    type: 'enum',
    enum: ValidationStatus,
    default: ValidationStatus.INVALID,
  })
  validationStatus: ValidationStatus;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    default: ReviewStatus.PENDING,
  })
  reviewStatus: ReviewStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  correctedVrm: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reviewedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string;

  @Column({ type: 'jsonb', nullable: true })
  images: Array<{ url: string; type: string; timestamp?: string }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
