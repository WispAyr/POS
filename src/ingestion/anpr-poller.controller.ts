import { Controller, Post, Logger, Query } from '@nestjs/common';
import { AnprPollerService } from './services/anpr-poller.service';
import { MondayIntegrationService } from '../integration/monday-integration.service';

@Controller('ingestion/anpr')
export class AnprPollerController {
    private readonly logger = new Logger(AnprPollerController.name);

    constructor(
        private readonly anprPollerService: AnprPollerService,
        private readonly mondayService: MondayIntegrationService,
    ) { }

    @Post('poll')
    async triggerPoll(
        @Query('hours') hours?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const hoursNum = hours ? parseInt(hours, 10) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : undefined;
        const offsetNum = offset ? parseInt(offset, 10) : undefined;

        this.logger.log(`Manual poll triggered via API (hours=${hoursNum || 'default'}, limit=${limitNum || 'default'}, offset=${offsetNum || 0})`);
        const counts = await this.anprPollerService.pollEvents(hoursNum, limitNum, offsetNum);
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
                    'EXIT'
                );
                results.push({ ...cam, itemId, status: 'pushed' });
            } catch (err) {
                results.push({ ...cam, status: 'error', error: err.message });
            }
        }

        return {
            message: `Discovered ${cameras.length} cameras`,
            cameras: results
        };
    }
}
