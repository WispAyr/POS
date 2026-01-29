import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SessionStatus {
  PROVISIONAL = 'PROVISIONAL',
  COMPLETED = 'COMPLETED',
  INVALID = 'INVALID',
}

@Entity('sessions')
@Index(['vrm', 'siteId'])
@Index(['startTime'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  siteId: string;

  @Column()
  vrm: string;

  // We store IDs to keep flexibility, or could use Relations
  @Column({ type: 'uuid', nullable: true })
  entryMovementId: string | null;

  @Column({ type: 'uuid', nullable: true })
  exitMovementId: string | null;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.PROVISIONAL,
  })
  status: SessionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
