import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RecipientType {
  TELEGRAM_USER = 'TELEGRAM_USER',
  TELEGRAM_GROUP = 'TELEGRAM_GROUP',
  EMAIL = 'EMAIL',
}

@Entity('notification_recipients')
@Index(['type'])
@Index(['enabled'])
export class NotificationRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: RecipientType,
  })
  type: RecipientType;

  @Column()
  name: string; // "Karl", "Operations Group"

  @Column()
  identifier: string; // Telegram chat ID or email address

  @Column({ type: 'varchar', nullable: true })
  telegramUsername: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
