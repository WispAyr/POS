import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuildAudit } from '../domain/entities/build-audit.entity';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface BuildMetadata {
  nodeVersion?: string;
  npmVersion?: string;
  os?: string;
  architecture?: string;
  buildTime?: number;
  buildOutput?: string[];
  errors?: string[];
  warnings?: string[];
  ci?: boolean;
  ciWorkflow?: string;
  ciRunId?: string;
  ciJobId?: string;
  ciRunner?: string;
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

@Injectable()
export class BuildService {
  private readonly logger = new Logger(BuildService.name);

  constructor(
    @InjectRepository(BuildAudit)
    private readonly buildAuditRepo: Repository<BuildAudit>,
  ) {}

  /**
   * Get current version information from package.json and git
   */
  async getVersionInfo(): Promise<VersionInfo> {
    const version: VersionInfo = {};

    try {
      // Backend version
      const backendPackageJson = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
      );
      version.backend = backendPackageJson.version;

      // Frontend version
      const frontendPackageJsonPath = join(
        process.cwd(),
        'frontend',
        'package.json',
      );
      if (existsSync(frontendPackageJsonPath)) {
        const frontendPackageJson = JSON.parse(
          readFileSync(frontendPackageJsonPath, 'utf-8'),
        );
        version.frontend = frontendPackageJson.version;
      }
    } catch (error) {
      this.logger.warn('Failed to read package.json files', error);
    }

    try {
      // Git information
      version.gitCommit = this.getGitCommit();
      version.gitBranch = this.getGitBranch();
      version.gitTag = this.getGitTag();
    } catch (error) {
      this.logger.warn('Failed to get git information', error);
    }

    // CI/CD information
    if (process.env.GITHUB_RUN_ID) {
      version.buildNumber = process.env.GITHUB_RUN_ID;
      version.buildId = `ci-${process.env.GITHUB_RUN_ID}`;
    } else {
      version.buildId = `local-${Date.now()}`;
    }

    return version;
  }

  /**
   * Get current dependencies from package.json
   */
  async getDependencies(): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
      );

      // Production dependencies
      if (packageJson.dependencies) {
        Object.entries(packageJson.dependencies).forEach(([name, version]) => {
          dependencies.push({
            name,
            version: version as string,
            type: 'dependency',
          });
        });
      }

      // Dev dependencies
      if (packageJson.devDependencies) {
        Object.entries(packageJson.devDependencies).forEach(
          ([name, version]) => {
            dependencies.push({
              name,
              version: version as string,
              type: 'devDependency',
            });
          },
        );
      }
    } catch (error) {
      this.logger.warn('Failed to read dependencies', error);
    }

    return dependencies;
  }

  /**
   * Get build metadata (environment, timing, etc.)
   */
  async getBuildMetadata(): Promise<BuildMetadata> {
    const metadata: BuildMetadata = {};

    try {
      metadata.nodeVersion = process.version;
      metadata.npmVersion = execSync('npm --version', {
        encoding: 'utf-8',
      }).trim();
      metadata.os = process.platform;
      metadata.architecture = process.arch;
    } catch (error) {
      this.logger.warn('Failed to get build metadata', error);
    }

    // CI/CD environment
    if (process.env.GITHUB_ACTIONS === 'true') {
      metadata.ci = true;
      metadata.ciWorkflow = process.env.GITHUB_WORKFLOW;
      metadata.ciRunId = process.env.GITHUB_RUN_ID;
      metadata.ciJobId = process.env.GITHUB_JOB;
      metadata.ciRunner = process.env.RUNNER_OS;
    }

    return metadata;
  }

  /**
   * Log build start
   */
  async logBuildStart(
    buildType: string,
    actor?: string,
    actorType?: string,
  ): Promise<BuildAudit> {
    const version = await this.getVersionInfo();
    const dependencies = await this.getDependencies();
    const metadata = await this.getBuildMetadata();

    const buildId = version.buildId || `build-${Date.now()}`;

    const buildAudit = this.buildAuditRepo.create({
      buildId,
      buildType,
      status: 'STARTED',
      version,
      dependencies,
      metadata,
      actor: actor || 'SYSTEM',
      actorType: actorType || 'SYSTEM',
      ciWorkflow: process.env.GITHUB_WORKFLOW,
      ciRunId: process.env.GITHUB_RUN_ID,
      ciJobId: process.env.GITHUB_JOB,
      timestamp: new Date(),
    });

    const saved = await this.buildAuditRepo.save(buildAudit);
    this.logger.log(`Build started: ${buildId} (${buildType})`);
    return saved;
  }

  /**
   * Log build progress
   */
  async logBuildProgress(
    buildId: string,
    status: string,
    metadata?: Partial<BuildMetadata>,
  ): Promise<BuildAudit> {
    const buildAudit = await this.buildAuditRepo.findOne({
      where: { buildId },
    });
    if (!buildAudit) {
      throw new Error(`Build audit not found: ${buildId}`);
    }

    buildAudit.status = status;
    if (metadata) {
      buildAudit.metadata = { ...buildAudit.metadata, ...metadata };
    }

    return this.buildAuditRepo.save(buildAudit);
  }

  /**
   * Log build completion
   */
  async logBuildComplete(
    buildId: string,
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED',
    options?: {
      artifacts?: string[];
      testResults?: BuildAudit['testResults'];
      errorMessage?: string;
      errorDetails?: any;
      duration?: number;
      version?: VersionInfo;
      metadata?: any;
    },
  ): Promise<BuildAudit> {
    const buildAudit = await this.buildAuditRepo.findOne({
      where: { buildId },
    });
    if (!buildAudit) {
      throw new Error(`Build audit not found: ${buildId}`);
    }

    buildAudit.status = status;
    buildAudit.completedAt = new Date();
    buildAudit.duration =
      options?.duration ||
      buildAudit.completedAt.getTime() - buildAudit.timestamp.getTime();

    if (options?.artifacts) {
      buildAudit.artifacts = options.artifacts;
    }

    if (options?.testResults) {
      buildAudit.testResults = options.testResults;
    }

    if (options?.errorMessage) {
      buildAudit.errorMessage = options.errorMessage;
    }

    if (options?.errorDetails) {
      buildAudit.errorDetails = options.errorDetails;
    }

    if (options?.version) {
      buildAudit.version = options.version;
    }

    if (options?.metadata) {
      buildAudit.metadata = { ...buildAudit.metadata, ...options.metadata };
    }

    const saved = await this.buildAuditRepo.save(buildAudit);
    this.logger.log(`Build completed: ${buildId} (${status})`);
    return saved;
  }

  /**
   * Create a historical build record (for backfilling)
   */
  async createHistoricalBuild(
    buildId: string,
    buildType: string,
    version: VersionInfo,
    timestamp: Date,
    options?: {
      status?: 'SUCCESS' | 'FAILED' | 'CANCELLED';
      actor?: string;
      actorType?: string;
      metadata?: any;
      dependencies?: DependencyInfo[];
    },
  ): Promise<BuildAudit> {
    // Check if build already exists
    const existing = await this.buildAuditRepo.findOne({ where: { buildId } });
    if (existing) {
      this.logger.log(`Build ${buildId} already exists, skipping`);
      return existing;
    }

    const dependencies =
      options?.dependencies || (await this.getDependencies());
    const metadata = {
      ...(await this.getBuildMetadata()),
      ...(options?.metadata || {}),
    };

    const buildAudit = this.buildAuditRepo.create({
      buildId,
      buildType,
      status: options?.status || 'SUCCESS',
      version,
      dependencies,
      metadata,
      actor: options?.actor || 'SYSTEM',
      actorType: options?.actorType || 'SYSTEM',
      timestamp,
      completedAt: timestamp,
      duration: 0,
    });

    const saved = await this.buildAuditRepo.save(buildAudit);
    this.logger.log(`Created historical build: ${buildId} (${buildType})`);
    return saved;
  }

  /**
   * Get build history
   */
  async getBuildHistory(options?: {
    buildType?: string;
    status?: string;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<BuildAudit[]> {
    const query = this.buildAuditRepo.createQueryBuilder('build');

    if (options?.buildType) {
      query.andWhere('build.buildType = :buildType', {
        buildType: options.buildType,
      });
    }

    if (options?.status) {
      query.andWhere('build.status = :status', { status: options.status });
    }

    if (options?.startDate) {
      query.andWhere('build.timestamp >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      query.andWhere('build.timestamp <= :endDate', {
        endDate: options.endDate,
      });
    }

    query.orderBy('build.timestamp', 'DESC');

    if (options?.limit) {
      query.take(options.limit);
    }

    if (options?.offset) {
      query.skip(options.offset);
    }

    return query.getMany();
  }

  /**
   * Get build by ID
   */
  async getBuildById(buildId: string): Promise<BuildAudit | null> {
    return this.buildAuditRepo.findOne({ where: { buildId } });
  }

  /**
   * Get latest build
   */
  async getLatestBuild(buildType?: string): Promise<BuildAudit | null> {
    const query = this.buildAuditRepo.createQueryBuilder('build');

    if (buildType) {
      query.where('build.buildType = :buildType', { buildType });
    }

    query.orderBy('build.timestamp', 'DESC').take(1);

    return query.getOne();
  }

  /**
   * Get version history (all builds with version changes)
   */
  async getVersionHistory(): Promise<BuildAudit[]> {
    return this.buildAuditRepo
      .createQueryBuilder('build')
      .orderBy('build.timestamp', 'DESC')
      .getMany();
  }

  /**
   * Get git commit hash
   */
  private getGitCommit(): string | undefined {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Get git branch
   */
  private getGitBranch(): string | undefined {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
      }).trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Get git tag
   */
  private getGitTag(): string | undefined {
    try {
      return (
        execSync('git describe --tags --exact-match 2>/dev/null || echo ""', {
          encoding: 'utf-8',
        }).trim() || undefined
      );
    } catch {
      return undefined;
    }
  }
}
