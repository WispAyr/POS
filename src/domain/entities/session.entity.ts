import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

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
    @Column({ nullable: true })
    entryMovementId: string;

    @Column({ nullable: true })
    exitMovementId: string;

    @Column({ type: 'timestamp' })
    startTime: Date;

    @Column({ type: 'timestamp', nullable: true })
    endTime: Date;

    @Column({ type: 'int', nullable: true })
    durationMinutes: number;

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
