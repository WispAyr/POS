import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('permits')
@Index(['vrm'])
export class Permit {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: true }) // Null = Global
    siteId: string;

    @Column()
    vrm: string;

    @Column()
    type: string; // 'WHITELIST', 'RESIDENT', 'STAFF', 'CONTRACTOR'

    @Column({ type: 'timestamp' })
    startDate: Date;

    @Column({ type: 'timestamp', nullable: true })
    endDate: Date; // Null = Indefinite

    @Column({ default: true })
    active: boolean;

    @CreateDateColumn()
    createdAt: Date;
}
