import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('vehicle_notes')
@Index(['vrm'])
export class VehicleNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vrm: string;

  @Column('text')
  note: string;

  @Column()
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
