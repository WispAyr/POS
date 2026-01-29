import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum PlateRegion {
  UK = 'UK',
  EU = 'EU',
  US = 'US',
  INTERNATIONAL = 'INTERNATIONAL',
}

@Entity('plate_validation_rules')
export class PlateValidationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text' })
  pattern: string;

  @Column({
    type: 'enum',
    enum: PlateRegion,
  })
  region: PlateRegion;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
