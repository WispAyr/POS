import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('notification_templates')
@Index(['name'])
@Index(['enabled'])
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // "Daily PCN Summary"

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  body: string; // "Approved: {{pcn_approved_today}}, Declined: {{pcn_declined_today}}"

  @Column({ type: 'simple-array' })
  variables: string[]; // ['pcn_approved_today', 'pcn_declined_today']

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
