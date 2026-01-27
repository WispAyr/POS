import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site, Permit } from '../domain/entities';
import { MondayBoardData, MondayItem, MondayColumnValue } from './interfaces/monday-data.interface';

@Injectable()
export class MondayIntegrationService {
    private readonly logger = new Logger(MondayIntegrationService.name);
    private readonly apiUrl = 'https://api.monday.com/v2';
    private readonly apiKey: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        @InjectRepository(Site)
        private readonly siteRepo: Repository<Site>,
        @InjectRepository(Permit)
        private readonly permitRepo: Repository<Permit>,
    ) {
        this.apiKey = this.configService.get<string>('MONDAY_API_KEY') || '';
    }

    async syncAll() {
        this.logger.log('Starting Monday.com sync...');
        await this.syncSites();
        await this.syncWhitelists();
        this.logger.log('Monday.com sync completed.');
    }

    private async fetchBoardItems(boardId: number): Promise<MondayItem[]> {
        const query = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: 500) {
            items {
              id
              name
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    this.apiUrl,
                    { query },
                    { headers: { Authorization: this.apiKey } },
                ),
            );

            if (response.data.errors) {
                this.logger.error('GraphQL Errors', response.data.errors);
                return [];
            }

            const boardData = response.data.data.boards[0] as MondayBoardData;
            return boardData?.items_page?.items || [];
        } catch (error) {
            this.logger.error(`Failed to fetch board ${boardId}`, error);
            return [];
        }
    }

    private async syncSites() {
        // Board: Car Parks (1893442639)
        // Map: text_mkt4k6yt -> Site.id (e.g. "KOD01")
        //      name -> Site.name
        //      color_mkpjp7nb -> Status ("Active" check)

        const items = await this.fetchBoardItems(1893442639);
        for (const item of items) {
            const siteIdCol = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkt4k6yt');
            const statusCol = item.column_values.find((c: MondayColumnValue) => c.id === 'color_mkpjp7nb');

            const siteId = siteIdCol?.text;
            const isActive = statusCol?.text === 'Active';

            if (siteId && isActive) {
                // Create or Update Site
                let site = await this.siteRepo.findOne({ where: { id: siteId } });
                if (!site) {
                    site = this.siteRepo.create({ id: siteId });
                }

                // Update basic info
                site.name = item.name;
                // NOTE: We could map more config here from other columns if needed

                await this.siteRepo.save(site);
                this.logger.debug(`Synced Site: ${siteId}`);
            }
        }
    }

    private async syncWhitelists() {
        // Board: Whitelists (1893468235)
        // Map: name -> Permit.vrm
        //      text_mkr3e6as -> Permit.siteId
        //      date_mkpj4ap1 -> Permit.startDate
        //      date_mkqeq1q6 -> Permit.endDate

        const items = await this.fetchBoardItems(1893468235);
        for (const item of items) {
            const vrm = item.name;
            const siteId = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkr3e6as')?.text;
            const startDate = item.column_values.find((c: MondayColumnValue) => c.id === 'date_mkpj4ap1')?.text;
            const endDate = item.column_values.find((c: MondayColumnValue) => c.id === 'date_mkqeq1q6')?.text;

            if (vrm && siteId) {
                // Simple logic for now: Treat Monday as source of truth. 
                // We might want to avoid duplicates or update existing based on VRM+Site key.

                let permit = await this.permitRepo.findOne({
                    where: { vrm: vrm, siteId: siteId, type: 'WHITELIST' }
                });

                if (!permit) {
                    permit = this.permitRepo.create({
                        vrm: vrm,
                        siteId: siteId,
                        type: 'WHITELIST'
                    });
                }

                if (startDate) permit.startDate = new Date(startDate);
                if (endDate) permit.endDate = new Date(endDate);

                await this.permitRepo.save(permit);
                this.logger.debug(`Synced Permit: ${vrm} for ${siteId}`);
            }
        }
    }

    // ============ CAMERA CONFIGURATION BOARD ============
    // Board ID will be stored in env or discovered dynamically
    private cameraConfigBoardId: number | null = null;

    async getOrCreateCameraConfigBoard(): Promise<number> {
        if (this.cameraConfigBoardId) return this.cameraConfigBoardId;

        // Check env for existing board ID
        const envBoardId = this.configService.get<string>('MONDAY_CAMERA_BOARD_ID');
        if (envBoardId) {
            this.cameraConfigBoardId = parseInt(envBoardId, 10);
            return this.cameraConfigBoardId;
        }

        // Create new board
        const mutation = `
            mutation {
                create_board(
                    board_name: "Camera Configuration",
                    board_kind: public
                ) {
                    id
                }
            }
        `;

        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    this.apiUrl,
                    { query: mutation },
                    { headers: { Authorization: this.apiKey } },
                ),
            );

            if (response.data.errors) {
                this.logger.error('Failed to create Camera Config board', response.data.errors);
                throw new Error('Failed to create board');
            }

            this.cameraConfigBoardId = parseInt(response.data.data.create_board.id, 10);
            this.logger.log(`Created Camera Config Board: ${this.cameraConfigBoardId}`);

            // Add columns to the board
            await this.addCameraConfigColumns(this.cameraConfigBoardId);

            return this.cameraConfigBoardId;
        } catch (error) {
            this.logger.error('Error creating Camera Config board', error);
            throw error;
        }
    }

    private async addCameraConfigColumns(boardId: number) {
        const columns = [
            { id: 'site_id', title: 'Site ID', type: 'text' },
            { id: 'camera_id', title: 'Camera ID', type: 'text' },
            { id: 'towards_dir', title: 'Towards Direction', type: 'text' },
            { id: 'away_dir', title: 'Away Direction', type: 'text' },
        ];

        for (const col of columns) {
            const mutation = `
                mutation {
                    create_column(
                        board_id: ${boardId},
                        title: "${col.title}",
                        column_type: ${col.type}
                    ) {
                        id
                    }
                }
            `;

            try {
                await firstValueFrom(
                    this.httpService.post(
                        this.apiUrl,
                        { query: mutation },
                        { headers: { Authorization: this.apiKey } },
                    ),
                );
                this.logger.debug(`Created column: ${col.title}`);
            } catch (error) {
                this.logger.warn(`Column ${col.title} may already exist`);
            }
        }
    }

    async pushCameraToMonday(siteId: string, cameraId: string, towardsDir: string = 'ENTRY', awayDir: string = 'EXIT') {
        const boardId = await this.getOrCreateCameraConfigBoard();

        const columnValues = JSON.stringify({
            site_id: siteId,
            camera_id: cameraId,
            towards_dir: towardsDir,
            away_dir: awayDir,
        });

        const mutation = `
            mutation {
                create_item(
                    board_id: ${boardId},
                    item_name: "${cameraId}",
                    column_values: ${JSON.stringify(columnValues)}
                ) {
                    id
                }
            }
        `;

        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    this.apiUrl,
                    { query: mutation },
                    { headers: { Authorization: this.apiKey } },
                ),
            );

            if (response.data.errors) {
                this.logger.error(`Failed to push camera ${cameraId}`, response.data.errors);
                return null;
            }

            this.logger.log(`Pushed camera ${cameraId} to Monday.com`);
            return response.data.data.create_item.id;
        } catch (error) {
            this.logger.error(`Error pushing camera ${cameraId}`, error);
            return null;
        }
    }

    async syncCameraConfigs() {
        // Use existing ANPR Cameras board (1952030503) or env override
        const boardId = this.configService.get<string>('MONDAY_CAMERA_BOARD_ID') || '1952030503';

        this.logger.log(`Syncing camera configs from board ${boardId}...`);

        const items = await this.fetchBoardItems(parseInt(boardId, 10));

        for (const item of items) {
            // Map columns from existing board structure
            // text_mkqv97ry = Site ID (e.g., "GRN01")
            // text_mkw217pv = Towards Direction (what "Towards" motion maps to)
            // text_mkw2sxg9 = Away Direction (what "Away" motion maps to)
            const siteIdCol = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkqv97ry');
            const towardsDirCol = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkw217pv');
            const awayDirCol = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkw2sxg9');

            const cameraId = item.name; // Camera name is the item name
            const siteId = siteIdCol?.text;

            // Direction values like "towards", "away" tell us what the raw camera motion means
            // If towards_dir = "away", it means camera's "Towards" motion = EXIT
            // If towards_dir = "towards", it means camera's "Towards" motion = ENTRY
            const towardsRaw = towardsDirCol?.text?.toLowerCase() || 'towards';
            const awayRaw = awayDirCol?.text?.toLowerCase() || 'away';

            // Normalize: does "Towards" from this camera mean ENTRY or EXIT?
            const towardsDirection = towardsRaw === 'towards' ? 'ENTRY' : 'EXIT';
            const awayDirection = awayRaw === 'away' ? 'EXIT' : 'ENTRY';

            if (siteId && cameraId && cameraId !== '?') {
                // Update Site config with camera mapping
                const site = await this.siteRepo.findOne({ where: { id: siteId } });
                if (site) {
                    if (!site.config) site.config = {};
                    if (!site.config.cameras) site.config.cameras = [];

                    // Find or create camera entry
                    let camConfig = site.config.cameras.find(c => c.id?.toLowerCase() === cameraId.toLowerCase());
                    if (!camConfig) {
                        camConfig = { id: cameraId };
                        site.config.cameras.push(camConfig);
                    }

                    camConfig.towardsDirection = towardsDirection as 'ENTRY' | 'EXIT';
                    camConfig.awayDirection = awayDirection as 'ENTRY' | 'EXIT';

                    await this.siteRepo.save(site);
                    this.logger.debug(`Synced camera config: ${cameraId} (${siteId}) - Towards=${towardsDirection}, Away=${awayDirection}`);
                } else {
                    this.logger.warn(`Site ${siteId} not found for camera ${cameraId}`);
                }
            }
        }

        this.logger.log(`Camera config sync complete. Processed ${items.length} items.`);
        return { count: items.length };
    }
}
