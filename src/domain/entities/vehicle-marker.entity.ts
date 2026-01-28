import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('vehicle_markers')
@Index(['vrm'])
export class VehicleMarker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vrm: string;

  @Column()
  markerType: string; // 'REPEAT_OFFENDER', 'VIP', 'PERMIT_HOLDER', etc.

  @Column('text', { nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
