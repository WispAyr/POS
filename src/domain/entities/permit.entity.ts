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
}

@Entity('permits')
@Index(['vrm'])
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
  mondayItemId: string;

  @CreateDateColumn()
  createdAt: Date;
}
