import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('payments')
@Index(['vrm', 'siteId'])
@Index(['expiryTime'])
@Index(['siteId', 'startTime', 'expiryTime']) // For active payment queries
@Index(['siteId', 'expiryTime']) // For expiring payments queries
export class Payment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    siteId: string;

    @Column()
    vrm: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: number;

    @Column({ type: 'timestamp' })
    startTime: Date;

    @Column({ type: 'timestamp' })
    expiryTime: Date;

    @Column()
    source: string; // 'APP', 'KIOSK', 'TERM', 'IMPORT'

    @Column({ nullable: true })
    externalReference: string;

    @Column({ type: 'jsonb', nullable: true })
    rawData: any;

    @CreateDateColumn()
    ingestedAt: Date;
}
