import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sites')
export class Site {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb', default: {} })
  config: {
    operatingModel?: string; // e.g. 'ANPR', 'Whitlelist', 'Barrier'
    gracePeriods?: {
      entry?: number;
      exit?: number;
      overstay?: number;
    };
    cameras?: {
      id: string;
      direction?: 'ENTRY' | 'EXIT' | 'INTERNAL'; // Legacy: fixed direction
      towardsDirection?: 'ENTRY' | 'EXIT'; // What "Towards" motion means for this camera
      awayDirection?: 'ENTRY' | 'EXIT'; // What "Away" motion means for this camera
      name?: string;
    }[];
    realTime?: boolean;
    liveOps?: {
      enabled: boolean;
      cameras?: {
        id: string;
        name: string;
        protectId: string;
      }[];
      announcements?: {
        id: string;
        label: string;
        message: string;
        target: 'cameras' | 'horn' | 'all';
        volume: number;
      }[];
      controls?: {
        barrier?: {
          enabled: boolean;
          apiEndpoint?: string;
        };
      };
    };
    [key: string]: any;
  };

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
