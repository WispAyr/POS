import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum PermitType {
  WHITELIST = 'WHITELIST',
  RESIDENT = 'RESIDENT',
  STAFF = 'STAFF',
  CONTRACTOR = 'CONTRACTOR',
  QRWHITELIST = 'QRWHITELIST',
}

export enum PermitSource {
  MONDAY = 'MONDAY',
  QRWHITELIST = 'QRWHITELIST',
  MANUAL = 'MANUAL',
  API = 'API',
}

@Entity('permits')
@Index(['vrm'])
@Index(['source'])
@Index(['type'])
export class Permit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: true }) // Null = Global
  siteId: string | null;

  @Column()
  vrm: string;

  @Column({ type: 'varchar', default: PermitType.WHITELIST })
  type: PermitType;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate: Date | null; // Null = Indefinite

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  mondayItemId: string | null;

  @Column({ type: 'varchar', nullable: true })
  source: PermitSource | null; // Source of the permit

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    submitterName?: string;
    submitterEmail?: string;
    submitterPhone?: string;
    jsonUrl?: string;
    notes?: string;
    [key: string]: any;
  } | null;

  @CreateDateColumn()
  createdAt: Date;
}
