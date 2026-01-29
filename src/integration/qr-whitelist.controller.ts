import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QRWhitelistService } from './qr-whitelist.service';

@Controller('api/qr-whitelist')
export class QRWhitelistController {
  constructor(private readonly qrWhitelistService: QRWhitelistService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async triggerSync() {
    const result = await this.qrWhitelistService.triggerSync();
    return {
      message: 'QR Whitelist sync completed',
      processed: result.processed,
      errors: result.errors,
    };
  }

  @Get('logs')
  async getIngestionLogs(@Query('limit') limit?: string) {
    const logs = this.qrWhitelistService.getRecentIngestionLogs(
      limit ? parseInt(limit, 10) : 50,
    );
    return { logs };
  }

  @Get('board-structure')
  async getBoardStructure() {
    const structure = await this.qrWhitelistService.getBoardStructure();
    return {
      message: 'Board structure retrieved for investigation',
      structure,
    };
  }
}
