import { Controller, Post, Get, Logger, Query, Body } from '@nestjs/common';
import { AnprPollerService } from './services/anpr-poller.service';
import { AnprSyncService, SyncConfig } from './services/anpr-sync.service';
import { AnprFolderImportService } from './services/anpr-folder-import.service';
import { MondayIntegrationService } from '../integration/monday-integration.service';

@Controller('ingestion/anpr')
export class AnprPollerController {
  private readonly logger = new Logger(AnprPollerController.name);

  constructor(
    private readonly anprPollerService: AnprPollerService,
    private readonly anprSyncService: AnprSyncService,
    private readonly anprFolderImportService: AnprFolderImportService,
    private readonly mondayService: MondayIntegrationService,
  ) {}

  @Post('poll')
  async triggerPoll(
    @Query('hours') hours?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const hoursNum = hours ? parseInt(hours, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    const offsetNum = offset ? parseInt(offset, 10) : undefined;

    this.logger.log(
      `Manual poll triggered via API (hours=${hoursNum || 'default'}, limit=${limitNum || 'default'}, offset=${offsetNum || 0})`,
    );
    const counts = await this.anprPollerService.pollEvents(
      hoursNum,
      limitNum,
      offsetNum,
    );
    return { message: 'Poll completed', ...counts };
  }

  @Post('discover')
  async discoverCameras() {
    this.logger.log('Discovering cameras from ANPR feed...');

    const cameras = await this.anprPollerService.discoverCameras();

    // Push each camera to Monday.com
    const results = [];
    for (const cam of cameras) {
      try {
        // Default direction mapping: Towards=ENTRY, Away=EXIT for now
        const itemId = await this.mondayService.pushCameraToMonday(
          cam.siteId,
          cam.cameraId,
          'ENTRY',
          'EXIT',
        );
        results.push({ ...cam, itemId, status: 'pushed' });
      } catch (err) {
        results.push({ ...cam, status: 'error', error: err.message });
      }
    }

    return {
      message: `Discovered ${cameras.length} cameras`,
      cameras: results,
    };
  }

  // ==================== Remote Sync Endpoints ====================

  @Get('sync/config')
  getSyncConfig() {
    return this.anprSyncService.getConfig();
  }

  @Post('sync/config')
  updateSyncConfig(@Body() updates: Partial<SyncConfig>) {
    this.logger.log('Updating sync configuration');
    return this.anprSyncService.updateConfig(updates);
  }

  @Post('sync')
  async triggerSync(
    @Query('dryRun') dryRun?: string,
    @Query('deleteAfterSync') deleteAfterSync?: string,
  ) {
    const isDryRun = dryRun === 'true';
    const shouldDelete = deleteAfterSync === 'true';

    this.logger.log(
      `Manual sync triggered (dryRun=${isDryRun}, deleteAfterSync=${shouldDelete})`,
    );

    const result = await this.anprSyncService.syncFromRemote({
      dryRun: isDryRun,
      deleteAfterSync: shouldDelete,
    });

    return {
      message: result.success ? 'Sync completed' : 'Sync failed',
      ...result,
    };
  }

  @Get('sync/files')
  async listSyncedFiles() {
    const files = await this.anprSyncService.listLocalFiles();
    return {
      localPath: this.anprSyncService.getLocalPath(),
      fileCount: files.length,
      files: files.slice(0, 100), // Limit response to first 100 files
      hasMore: files.length > 100,
    };
  }

  // ==================== Folder Import Endpoints ====================

  @Post('import')
  async importFromFolder(
    @Query('path') folderPath?: string,
    @Query('deleteAfterImport') deleteAfterImport?: string,
    @Query('limit') limit?: string,
  ) {
    const shouldDelete = deleteAfterImport === 'true';
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    this.logger.log(
      `Manual import triggered (path=${folderPath || 'default'}, deleteAfterImport=${shouldDelete}, limit=${limitNum || 'none'})`,
    );

    const result = await this.anprFolderImportService.importFromFolder(
      folderPath,
      {
        deleteAfterImport: shouldDelete,
        limit: limitNum,
      },
    );

    return {
      message: result.errors > 0 ? 'Import completed with errors' : 'Import completed',
      ...result,
    };
  }

  @Post('sync-and-import')
  async syncAndImport(
    @Query('deleteAfterImport') deleteAfterImport?: string,
    @Query('deleteFromRemote') deleteFromRemote?: string,
    @Query('limit') limit?: string,
  ) {
    const shouldDeleteLocal = deleteAfterImport === 'true';
    const shouldDeleteRemote = deleteFromRemote === 'true';
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    this.logger.log(
      `Sync and import triggered (deleteAfterImport=${shouldDeleteLocal}, deleteFromRemote=${shouldDeleteRemote}, limit=${limitNum || 'none'})`,
    );

    const result = await this.anprFolderImportService.syncAndImport({
      deleteAfterImport: shouldDeleteLocal,
      deleteFromRemote: shouldDeleteRemote,
      limit: limitNum,
    });

    return {
      message: result.sync.success
        ? 'Sync and import completed'
        : 'Sync failed, import skipped',
      sync: result.sync,
      import: result.import,
    };
  }
}
