import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export interface BuildMetadata {
  nodeVersion?: string;
  npmVersion?: string;
  os?: string;
  architecture?: string;
  buildTime?: number; // milliseconds
  buildOutput?: string[];
  errors?: string[];
  warnings?: string[];
  [key: string]: any;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency';
}

export interface VersionInfo {
  backend?: string;
  frontend?: string;
  gitCommit?: string;
  gitBranch?: string;
  gitTag?: string;
  buildNumber?: string;
  buildId?: string;
}

@Entity('build_audits')
@Index(['buildId'])
@Index(['version'])
@Index(['buildType', 'timestamp'])
@Index(['status', 'timestamp'])
export class BuildAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Build Identification
  @Column({ unique: true, nullable: true })
  buildId: string; // Unique build identifier (e.g., CI build number, local timestamp)

  @Column()
  buildType: string; // 'LOCAL', 'CI', 'CD', 'DEPLOYMENT', 'TEST', 'LINT', 'SECURITY_SCAN'

  @Column()
  status: string; // 'STARTED', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'CANCELLED'

  // Version Information
  @Column({ type: 'jsonb' })
  version: VersionInfo; // Backend, frontend, git info

  // Build Details
  @Column({ type: 'jsonb', nullable: true })
  dependencies: DependencyInfo[]; // Dependencies installed/updated

  @Column({ type: 'jsonb', nullable: true })
  metadata: BuildMetadata; // Build environment, timing, output

  // Actor Information
  @Column({ default: 'SYSTEM' })
  actor: string; // 'SYSTEM', User ID, CI System, etc.

  @Column({ type: 'varchar', nullable: true })
  actorType: string; // 'SYSTEM', 'USER', 'CI', 'CD', 'SCHEDULER'

  @Column({ type: 'varchar', nullable: true })
  ciWorkflow?: string; // GitHub Actions workflow name

  @Column({ type: 'varchar', nullable: true })
  ciRunId?: string; // GitHub Actions run ID

  @Column({ type: 'varchar', nullable: true })
  ciJobId?: string; // GitHub Actions job ID

  // Build Artifacts
  @Column({ type: 'jsonb', nullable: true })
  artifacts: string[]; // Paths to build artifacts

  @Column({ type: 'jsonb', nullable: true })
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coverage?: {
      lines: number;
      branches: number;
      functions: number;
      statements: number;
    };
  };

  // Error Information
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'jsonb', nullable: true })
  errorDetails?: any;

  // Timestamps
  @CreateDateColumn()
  timestamp: Date; // When build started

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date; // When build completed

  @Column({ type: 'integer', nullable: true })
  duration?: number; // Duration in milliseconds

  // Related Information
  @Column({ type: 'jsonb', nullable: true })
  relatedBuilds?: string[]; // IDs of related builds (e.g., test build after main build)

  @Column({ type: 'varchar', nullable: true })
  parentBuildId?: string; // Parent build (e.g., test build's parent is main build)
}
