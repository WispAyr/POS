import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

export interface SyncConfig {
  enabled: boolean;
  remoteHost: string;
  remoteUser: string;
  remotePath: string;
  localPath: string;
  sshKeyPath?: string;
  password?: string;
  cronExpression?: string;
}

export interface SyncResult {
  success: boolean;
  filesTransferred: number;
  bytesTransferred: number;
  duration: number;
  error?: string;
  output?: string;
}

@Injectable()
export class AnprSyncService implements OnModuleInit {
  private readonly logger = new Logger(AnprSyncService.name);
  private config: SyncConfig;
  private isSyncing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.config = this.loadConfig();
  }

  onModuleInit() {
    // Ensure local directory exists
    if (this.config.enabled) {
      this.ensureLocalDirectory();
      this.setupScheduledSync();
    }
  }

  private loadConfig(): SyncConfig {
    return {
      enabled:
        this.configService.get<string>('ANPR_SYNC_ENABLED', 'false') === 'true',
      remoteHost: this.configService.get<string>(
        'ANPR_SYNC_REMOTE_HOST',
        '142.202.191.208',
      ),
      remoteUser: this.configService.get<string>(
        'ANPR_SYNC_REMOTE_USER',
        'root',
      ),
      remotePath: this.configService.get<string>(
        'ANPR_SYNC_REMOTE_PATH',
        '/root/anpr-server/data/results/',
      ),
      localPath: this.configService.get<string>(
        'ANPR_SYNC_LOCAL_PATH',
        './data/anpr-results',
      ),
      sshKeyPath: this.configService.get<string>('ANPR_SYNC_SSH_KEY_PATH'),
      password: this.configService.get<string>('ANPR_SYNC_PASSWORD'),
      cronExpression: this.configService.get<string>('ANPR_SYNC_CRON'),
    };
  }

  private ensureLocalDirectory(): void {
    const absolutePath = path.resolve(this.config.localPath);
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
      this.logger.log(`Created local sync directory: ${absolutePath}`);
    }
  }

  private setupScheduledSync(): void {
    if (this.config.cronExpression) {
      try {
        const job = new CronJob(this.config.cronExpression, () => {
          this.syncFromRemote();
        });

        this.schedulerRegistry.addCronJob('anpr-sync', job);
        job.start();

        this.logger.log(
          `Scheduled ANPR sync with cron: ${this.config.cronExpression}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to setup scheduled sync: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  getConfig(): SyncConfig {
    return { ...this.config, password: this.config.password ? '***' : undefined };
  }

  updateConfig(updates: Partial<SyncConfig>): SyncConfig {
    this.config = { ...this.config, ...updates };

    // Re-setup scheduled sync if cron expression changed
    if (updates.cronExpression !== undefined) {
      try {
        this.schedulerRegistry.deleteCronJob('anpr-sync');
      } catch {
        // Job might not exist
      }
      if (updates.cronExpression) {
        this.setupScheduledSync();
      }
    }

    return this.getConfig();
  }

  async syncFromRemote(options?: {
    dryRun?: boolean;
    deleteAfterSync?: boolean;
  }): Promise<SyncResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        filesTransferred: 0,
        bytesTransferred: 0,
        duration: 0,
        error: 'ANPR sync is not enabled. Set ANPR_SYNC_ENABLED=true',
      };
    }

    if (this.isSyncing) {
      return {
        success: false,
        filesTransferred: 0,
        bytesTransferred: 0,
        duration: 0,
        error: 'Sync already in progress',
      };
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      this.ensureLocalDirectory();

      const remotePath = `${this.config.remoteUser}@${this.config.remoteHost}:${this.config.remotePath}`;
      const localPath = path.resolve(this.config.localPath) + '/';

      // Build rsync command
      const rsyncArgs: string[] = [
        '-avz', // archive, verbose, compress
        '--progress',
        '--stats',
      ];

      // Add dry-run flag if requested
      if (options?.dryRun) {
        rsyncArgs.push('--dry-run');
      }

      // Add delete flag to remove files from remote after successful transfer
      if (options?.deleteAfterSync) {
        rsyncArgs.push('--remove-source-files');
      }

      // Add SSH options
      if (this.config.sshKeyPath) {
        rsyncArgs.push('-e', `ssh -i ${this.config.sshKeyPath} -o StrictHostKeyChecking=no`);
      } else {
        rsyncArgs.push('-e', 'ssh -o StrictHostKeyChecking=no');
      }

      rsyncArgs.push(remotePath, localPath);

      this.logger.log(`Starting rsync from ${remotePath} to ${localPath}`);

      let output: string;

      if (this.config.password && !this.config.sshKeyPath) {
        // Use sshpass for password authentication
        output = await this.runWithSshpass(rsyncArgs);
      } else {
        // Use regular rsync (expects SSH key or ssh-agent)
        const result = await execPromise(`rsync ${rsyncArgs.join(' ')}`, {
          timeout: 600000, // 10 minute timeout
        });
        output = result.stdout + result.stderr;
      }

      const duration = Date.now() - startTime;
      const stats = this.parseRsyncStats(output);

      this.logger.log(
        `Sync completed: ${stats.filesTransferred} files, ${this.formatBytes(stats.bytesTransferred)} in ${duration}ms`,
      );

      return {
        success: true,
        filesTransferred: stats.filesTransferred,
        bytesTransferred: stats.bytesTransferred,
        duration,
        output: options?.dryRun ? output : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Sync failed: ${error.message}`, error.stack);

      return {
        success: false,
        filesTransferred: 0,
        bytesTransferred: 0,
        duration,
        error: error.message,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private async runWithSshpass(rsyncArgs: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const sshpassArgs = ['-p', this.config.password!, 'rsync', ...rsyncArgs];

      // Use full path for sshpass on macOS (Homebrew)
      const sshpassPath = process.platform === 'darwin'
        ? '/opt/homebrew/bin/sshpass'
        : 'sshpass';

      const proc = spawn(sshpassPath, sshpassArgs, {
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          reject(new Error(`rsync exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err: Error) => {
        if (err.message.includes('ENOENT')) {
          reject(
            new Error(
              'sshpass not found. Install it with: brew install hudochenkov/sshpass/sshpass (macOS) or apt-get install sshpass (Linux)',
            ),
          );
        } else {
          reject(err);
        }
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        proc.kill();
        reject(new Error('rsync timed out after 10 minutes'));
      }, 600000);
    });
  }

  private parseRsyncStats(output: string): {
    filesTransferred: number;
    bytesTransferred: number;
  } {
    let filesTransferred = 0;
    let bytesTransferred = 0;

    // Parse "Number of regular files transferred: X"
    const filesMatch = output.match(
      /Number of (?:regular )?files transferred:\s*(\d+)/i,
    );
    if (filesMatch) {
      filesTransferred = parseInt(filesMatch[1], 10);
    }

    // Parse "Total transferred file size: X bytes"
    const bytesMatch = output.match(
      /Total transferred file size:\s*([\d,]+)/i,
    );
    if (bytesMatch) {
      bytesTransferred = parseInt(bytesMatch[1].replace(/,/g, ''), 10);
    }

    return { filesTransferred, bytesTransferred };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getLocalPath(): string {
    return path.resolve(this.config.localPath);
  }

  async listLocalFiles(): Promise<string[]> {
    const localPath = this.getLocalPath();
    if (!fs.existsSync(localPath)) {
      return [];
    }
    return fs
      .readdirSync(localPath)
      .filter((f) => f.endsWith('.json'))
      .sort();
  }

  isSyncEnabled(): boolean {
    return this.config.enabled;
  }
}
