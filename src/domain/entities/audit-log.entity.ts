import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    entityType: string; // 'DECISION', 'SESSION', 'SITE', etc.

    @Column()
    entityId: string;

    @Column()
    action: string; // 'CREATED', 'UPDATED', 'APPROVED', 'EXPORTED'

    @Column({ type: 'jsonb', nullable: true })
    details: any; // Previous values, or specific change details

    @Column({ default: 'SYSTEM' })
    actor: string; // 'SYSTEM' or User ID

    @CreateDateColumn()
    timestamp: Date;
}
