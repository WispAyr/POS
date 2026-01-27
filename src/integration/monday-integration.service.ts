import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
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

    @Cron(CronExpression.EVERY_10_MINUTES)
    async syncAll() {
        this.logger.log('Starting Monday.com sync (scheduled)...');
        await this.syncSites();
        await this.syncWhitelists();
        this.logger.log('Monday.com sync completed.');
    }

    private async fetchBoardItems(boardId: number): Promise<MondayItem[] | null> {
        let allItems: MondayItem[] = [];
        let cursor: string | null = null;
        let hasMore = true;

        try {
            // Initial fetch
            const initialQuery = `
                query {
                    boards(ids: [${boardId}]) {
                        items_page(limit: 500) {
                            cursor
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

            const initialResponse = await firstValueFrom(
                this.httpService.post(
                    this.apiUrl,
                    { query: initialQuery },
                    { headers: { Authorization: this.apiKey } },
                ),
            );

            if (initialResponse.data.errors) {
                this.logger.error('GraphQL Errors', initialResponse.data.errors);
                return null;
            }

            const boardData = initialResponse.data.data.boards[0];
            const itemsPage = boardData?.items_page;

            if (itemsPage) {
                allItems = [...itemsPage.items];
                cursor = itemsPage.cursor;
            } else {
                hasMore = false;
            }

            // Pagination loop
            while (hasMore && cursor) {
                this.logger.log(`Fetching next page of items for board ${boardId}...`);
                const nextQuery = `
                    query {
                        next_items_page(limit: 500, cursor: "${cursor}") {
                            cursor
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
                `;

                const nextResponse = await firstValueFrom(
                    this.httpService.post(
                        this.apiUrl,
                        { query: nextQuery },
                        { headers: { Authorization: this.apiKey } },
                    ),
                );

                if (nextResponse.data.errors) {
                    this.logger.error('GraphQL Errors during pagination', nextResponse.data.errors);
                    break;
                }

                const nextData = nextResponse.data.data.next_items_page;
                if (nextData) {
                    allItems = [...allItems, ...nextData.items];
                    cursor = nextData.cursor;
                    if (!cursor) hasMore = false;
                } else {
                    hasMore = false;
                }
            }

            return allItems;
        } catch (error) {
            this.logger.error(`Failed to fetch board ${boardId}`, error);
            return null;
        }
    }

    private async syncSites() {
        // Board: Car Parks (1893442639)
        // Map: text_mkt4k6yt -> Site.id (e.g. "KOD01")
        //      name -> Site.name
        //      color_mkpjp7nb -> Status ("Active" check)

        const items = await this.fetchBoardItems(1893442639);
        if (!items) return;

        for (const item of items) {
            const siteIdCol = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkt4k6yt');
            const statusCol = item.column_values.find((c: MondayColumnValue) => c.id === 'color_mkpjp7nb');

            const siteId = siteIdCol?.text?.trim();
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

    async syncWhitelists() {
        // Board: Whitelists (1893468235)
        const boardId = 1893468235;
        const items = await this.fetchBoardItems(boardId);
        if (!items) {
            this.logger.warn(`Skipping whitelist sync as fetch failed.`);
            return 0;
        }
        const currentMondayIds = new Set(items.map(item => item.id));
        let count = 0;

        for (const item of items) {
            const vrm = item.name?.toUpperCase().replace(/\s/g, '');
            let siteId = item.column_values.find((c: MondayColumnValue) => c.id === 'text_mkr3e6as')?.text;

            // Allow cleaning up the value if it looks like a quoted string which sometimes happens in raw value returns
            if (siteId) {
                siteId = siteId.trim().replace(/^"|"$/g, '');
                if (siteId === '') siteId = undefined;
            }

            const startDateStr = item.column_values.find((c: MondayColumnValue) => c.id === 'date_mkpj4ap1')?.text;
            const endDateStr = item.column_values.find((c: MondayColumnValue) => c.id === 'date_mkqeq1q6')?.text;

            if (vrm) {
                // Try finding by Monday Item ID first, then by VRM + Site
                let permit = await this.permitRepo.findOne({
                    where: { mondayItemId: item.id }
                });

                if (!permit) {
                    const whereCondition = siteId
                        ? { vrm, siteId }
                        : { vrm, siteId: null as any };
                    permit = await this.permitRepo.findOne({
                        where: whereCondition
                    });
                }

                if (!permit) {
                    permit = this.permitRepo.create({ vrm, type: 'WHITELIST' });
                }

                permit.vrm = vrm;
                permit.siteId = siteId || null;
                permit.mondayItemId = item.id;

                if (startDateStr) permit.startDate = new Date(startDateStr);
                else if (!permit.startDate) permit.startDate = new Date();

                if (endDateStr) permit.endDate = new Date(endDateStr);
                else permit.endDate = null;

                await this.permitRepo.save(permit);
                this.logger.debug(`Synced Permit from Monday: ${vrm} (Item ID: ${item.id})`);
                count++;
            }
        }

        // Optional: Delete local permits that were synced from Monday but are no longer there
        // Note: Only delete if they have a mondayItemId
        const localPermits = await this.permitRepo.find({ where: { type: 'WHITELIST' } });
        for (const local of localPermits) {
            if (local.mondayItemId && !currentMondayIds.has(local.mondayItemId)) {
                this.logger.log(`Deleting local permit ${local.vrm} as it was removed from Monday (ID: ${local.mondayItemId})`);
                await this.permitRepo.remove(local);
            }
        }
        return count;
    }

    async pushPermitToMonday(permit: Permit) {
        const boardId = 1893468235;
        const columnValues = JSON.stringify({
            text_mkr3e6as: permit.siteId || "",
            date_mkpj4ap1: permit.startDate.toISOString().split('T')[0],
            date_mkqeq1q6: permit.endDate ? permit.endDate.toISOString().split('T')[0] : null,
        });

        const mutation = `
            mutation {
                create_item(
                    board_id: ${boardId},
                    item_name: "${permit.vrm}",
                    column_values: ${JSON.stringify(columnValues)}
                ) {
                    id
                }
            }
        `;

        try {
            const response = await firstValueFrom(
                this.httpService.post(this.apiUrl, { query: mutation }, { headers: { Authorization: this.apiKey } })
            );
            if (response.data.data?.create_item?.id) {
                permit.mondayItemId = response.data.data.create_item.id;
                await this.permitRepo.save(permit);
                this.logger.log(`Pushed permit ${permit.vrm} to Monday (ID: ${permit.mondayItemId})`);
            }
        } catch (error) {
            this.logger.error(`Failed to push permit ${permit.vrm} to Monday`, error);
        }
    }

    async updatePermitOnMonday(permit: Permit) {
        if (!permit.mondayItemId) return this.pushPermitToMonday(permit);

        const boardId = 1893468235;
        const columnValues = JSON.stringify({
            text_mkr3e6as: permit.siteId || "",
            date_mkpj4ap1: permit.startDate.toISOString().split('T')[0],
            date_mkqeq1q6: permit.endDate ? permit.endDate.toISOString().split('T')[0] : null,
        });

        const mutation = `
            mutation {
                change_multiple_column_values(
                    board_id: ${boardId},
                    item_id: ${permit.mondayItemId},
                    column_values: ${JSON.stringify(columnValues)}
                ) {
                    id
                }
            }
        `;

        try {
            await firstValueFrom(
                this.httpService.post(this.apiUrl, { query: mutation }, { headers: { Authorization: this.apiKey } })
            );
            this.logger.log(`Updated permit ${permit.vrm} on Monday (ID: ${permit.mondayItemId})`);
        } catch (error) {
            this.logger.error(`Failed to update permit ${permit.vrm} on Monday`, error);
        }
    }

    async deletePermitFromMonday(mondayItemId: string) {
        const mutation = `
            mutation {
                delete_item(item_id: ${mondayItemId}) {
                    id
                }
            }
        `;

        try {
            await firstValueFrom(
                this.httpService.post(this.apiUrl, { query: mutation }, { headers: { Authorization: this.apiKey } })
            );
            this.logger.log(`Deleted permit from Monday (ID: ${mondayItemId})`);
        } catch (error) {
            // If already deleted on Monday, that's fine
            this.logger.warn(`Failed to delete permit ${mondayItemId} from Monday`, error);
        }
    }
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
        if (!items) return { count: 0 };

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
