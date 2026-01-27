import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImageService {
    private readonly logger = new Logger(ImageService.name);
    private readonly uploadDir: string;

    constructor(private readonly httpService: HttpService) {
        this.uploadDir = path.join(process.cwd(), 'uploads', 'images');
        // Ensure directory exists
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    /**
     * Download an image from external URL and store locally
     * Returns the local filename (not full path)
     */
    async downloadAndStore(externalUrl: string, type: 'plate' | 'overview'): Promise<string | null> {
        if (!externalUrl) return null;

        try {
            // Rewrite localhost URLs to public ANPR API
            const url = externalUrl.replace('http://localhost:3000', 'http://anpr.parkwise.cloud');

            const response = await firstValueFrom(
                this.httpService.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                }),
            );

            // Generate unique filename
            const ext = this.getExtension(url);
            const filename = `${uuidv4()}-${type}${ext}`;
            const filepath = path.join(this.uploadDir, filename);

            // Write to disk
            fs.writeFileSync(filepath, Buffer.from(response.data));

            this.logger.debug(`Saved image: ${filename}`);
            return filename;
        } catch (error) {
            this.logger.warn(`Failed to download image from ${externalUrl}: ${error.message}`);
            return null;
        }
    }

    /**
     * Get image file path by filename
     */
    getImagePath(filename: string): string | null {
        const filepath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filepath)) {
            return filepath;
        }
        return null;
    }

    async clearAllImages(): Promise<number> {
        try {
            const files = fs.readdirSync(this.uploadDir);
            let deletedCount = 0;
            for (const file of files) {
                const filePath = path.join(this.uploadDir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
            this.logger.log(`Cleared ${deletedCount} images from storage`);
            return deletedCount;
        } catch (error) {
            this.logger.error(`Failed to clear images: ${error.message}`);
            return 0;
        }
    }

    private getExtension(url: string): string {
        const match = url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i);
        return match ? `.${match[1].toLowerCase()}` : '.jpg';
    }
}
