import { Controller, Post, Body } from '@nestjs/common';
import { MondayIntegrationService } from './monday-integration.service';

@Controller('integration/monday')
export class MondayController {
  constructor(private readonly mondayService: MondayIntegrationService) {}

  @Post('sync')
  async triggerSync() {
    const result = await this.mondayService.syncAll();
    return result;
  }

  @Post('permits/sync')
  async triggerWhitelistSync() {
    const count = await this.mondayService.syncWhitelists();
    return { message: 'Whitelist sync completed', count };
  }

  @Post('cameras/setup')
  async setupCameraBoard() {
    const boardId = await this.mondayService.getOrCreateCameraConfigBoard();
    return { message: 'Camera Config Board ready', boardId };
  }

  @Post('cameras/push')
  async pushCamera(
    @Body()
    body: {
      siteId: string;
      cameraId: string;
      towardsDir?: string;
      awayDir?: string;
    },
  ) {
    const itemId = await this.mondayService.pushCameraToMonday(
      body.siteId,
      body.cameraId,
      body.towardsDir || 'ENTRY',
      body.awayDir || 'EXIT',
    );
    return { message: 'Camera pushed to Monday.com', itemId };
  }

  @Post('cameras/sync')
  async syncCameras() {
    await this.mondayService.syncCameraConfigs();
    return { message: 'Camera configs synced from Monday.com' };
  }
}
