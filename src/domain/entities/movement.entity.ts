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
    type: 'plate' | 'overview';
    timestamp?: Date;
  }[];

  @Column({ type: 'jsonb' })
  rawData: any; // Immutable original record

  @CreateDateColumn()
  ingestedAt: Date;
}
