import {
  Controller,
  Post,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { execSync, spawn } from 'child_process';

interface UpdateStatus {
  currentCommit: string;
  currentBranch: string;
  remoteCommit: string | null;
  updateAvailable: boolean;
  lastChecked: Date;
  lastUpdated: Date | null;
  updateInProgress: boolean;
}

@Controller('api/update')
export class UpdateController {
  private readonly logger = new Logger(UpdateController.name);
  private readonly projectRoot: string;
  private updateInProgress = false;
  private lastUpdated: Date | null = null;

  constructor() {
    this.projectRoot = process.cwd();
  }

  @Get('status')
  async getUpdateStatus(): Promise<UpdateStatus> {
    try {
      const currentCommit = this.getCurrentCommit();
      const currentBranch = this.getCurrentBranch();

      // Fetch latest from remote without merging
      let remoteCommit: string | null = null;
      let updateAvailable = false;

      try {
        execSync('git fetch origin', {
          cwd: this.projectRoot,
          timeout: 30000,
          stdio: 'pipe',
        });

        remoteCommit = execSync(`git rev-parse origin/${currentBranch}`, {
          cwd: this.projectRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();

        updateAvailable = currentCommit !== remoteCommit;
      } catch (fetchError) {
        this.logger.warn('Could not fetch from remote', fetchError);
      }

      return {
        currentCommit,
        currentBranch,
        remoteCommit,
        updateAvailable,
        lastChecked: new Date(),
        lastUpdated: this.lastUpdated,
        updateInProgress: this.updateInProgress,
      };
    } catch (error) {
      this.logger.error('Failed to get update status', error);
      throw new HttpException(
        'Failed to check update status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('changelog')
  async getChangelog(): Promise<{ commits: Array<{ hash: string; message: string; date: string; author: string }> }> {
    try {
      const currentBranch = this.getCurrentBranch();

      // Fetch first
      try {
        execSync('git fetch origin', {
          cwd: this.projectRoot,
          timeout: 30000,
          stdio: 'pipe',
        });
      } catch {
        // Ignore fetch errors
      }

      // Get commits between current HEAD and remote
      const logOutput = execSync(
        `git log HEAD..origin/${currentBranch} --format="%H|%s|%ai|%an" 2>/dev/null || echo ""`,
        {
          cwd: this.projectRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        },
      ).trim();

      if (!logOutput) {
        return { commits: [] };
      }

      const commits = logOutput.split('\n').filter(Boolean).map((line) => {
        const [hash, message, date, author] = line.split('|');
        return { hash: hash.substring(0, 7), message, date, author };
      });

      return { commits };
    } catch (error) {
      this.logger.error('Failed to get changelog', error);
      return { commits: [] };
    }
  }

  @Post('trigger')
  async triggerUpdate(): Promise<{ success: boolean; message: string }> {
    if (this.updateInProgress) {
      throw new HttpException(
        'Update already in progress',
        HttpStatus.CONFLICT,
      );
    }

    this.updateInProgress = true;
    this.logger.log('Update triggered - starting git pull...');

    try {
      // Check for uncommitted changes
      const status = execSync('git status --porcelain', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();

      if (status) {
        this.updateInProgress = false;
        throw new HttpException(
          'Cannot update: there are uncommitted changes in the working directory',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get current branch and commit before pull
      const currentBranch = this.getCurrentBranch();
      const beforePullCommit = this.getCurrentCommit();

      // Perform git pull on the current branch
      const pullOutput = execSync(`git pull origin ${currentBranch}`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 60000,
        stdio: 'pipe',
      });

      this.logger.log(`Git pull completed: ${pullOutput}`);

      // Check if package.json changed (compare before and after pull)
      const afterPullCommit = this.getCurrentCommit();
      let changedFiles = '';
      if (beforePullCommit !== afterPullCommit) {
        changedFiles = execSync(`git diff --name-only ${beforePullCommit} ${afterPullCommit}`, {
          cwd: this.projectRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();
      }

      const needsNpmInstall = changedFiles.includes('package.json') || changedFiles.includes('package-lock.json');

      if (needsNpmInstall) {
        this.logger.log('package.json changed - running npm install...');
        execSync('npm install', {
          cwd: this.projectRoot,
          timeout: 300000, // 5 minutes for npm install
          stdio: 'pipe',
        });
        this.logger.log('npm install completed');
      }

      // Rebuild the application
      this.logger.log('Rebuilding application...');
      execSync('npm run build:no-audit', {
        cwd: this.projectRoot,
        timeout: 120000, // 2 minutes for build
        stdio: 'pipe',
      });
      this.logger.log('Build completed');

      this.lastUpdated = new Date();
      this.updateInProgress = false;

      // Schedule restart
      this.logger.log('Update complete - scheduling restart in 2 seconds...');
      this.scheduleRestart();

      return {
        success: true,
        message: 'Update successful. Application will restart shortly.',
      };
    } catch (error: unknown) {
      this.updateInProgress = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Update failed', error);
      throw new HttpException(
        `Update failed: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getCurrentCommit(): string {
    return execSync('git rev-parse HEAD', {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  }

  private getCurrentBranch(): string {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: this.projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  }

  private scheduleRestart(): void {
    // Give time for the response to be sent
    setTimeout(() => {
      this.logger.log('Restarting application...');

      // If running with a process manager like PM2, use restart
      // Otherwise, exit with code 0 and expect the process manager to restart
      if (process.env.PM2_HOME) {
        // Running under PM2
        const pm2 = spawn('pm2', ['restart', 'all'], {
          detached: true,
          stdio: 'ignore',
        });
        pm2.unref();
      } else {
        // Exit with success code - systemd/docker/supervisor should restart
        process.exit(0);
      }
    }, 2000);
  }
}
