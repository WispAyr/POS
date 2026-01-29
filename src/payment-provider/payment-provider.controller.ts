import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentProviderService } from './services/payment-provider.service';
import { EmailPaymentPollerService } from './services/email-payment-poller.service';
import { PaymentProviderMondayService } from './services/payment-provider-monday.service';
import { CreatePaymentProviderDto } from './dto/create-payment-provider.dto';
import { UpdatePaymentProviderDto } from './dto/update-payment-provider.dto';
import { AssignSiteDto } from './dto/assign-site.dto';

@Controller('api/payment-providers')
export class PaymentProviderController {
  constructor(
    private readonly providerService: PaymentProviderService,
    private readonly pollerService: EmailPaymentPollerService,
    private readonly mondayService: PaymentProviderMondayService,
  ) {}

  @Get()
  async listProviders() {
    return this.providerService.findAll();
  }

  @Get(':id')
  async getProvider(@Param('id') id: string) {
    return this.providerService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProvider(@Body() dto: CreatePaymentProviderDto) {
    return this.providerService.create(dto);
  }

  @Patch(':id')
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentProviderDto,
  ) {
    return this.providerService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProvider(@Param('id') id: string) {
    await this.providerService.delete(id);
  }

  // Site assignments
  @Get(':id/sites')
  async getAssignedSites(@Param('id') id: string) {
    return this.providerService.getAssignedSites(id);
  }

  @Post(':id/sites')
  @HttpCode(HttpStatus.CREATED)
  async assignSite(@Param('id') id: string, @Body() dto: AssignSiteDto) {
    return this.providerService.assignSite(id, dto);
  }

  @Delete(':id/sites/:siteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSiteAssignment(
    @Param('id') id: string,
    @Param('siteId') siteId: string,
  ) {
    await this.providerService.removeSiteAssignment(id, siteId);
  }

  // Sync operations
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  async triggerSync(@Param('id') id: string) {
    await this.pollerService.triggerManualSync(id);
    return { message: 'Sync triggered successfully' };
  }

  @Post(':id/test-connection')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Param('id') id: string) {
    return this.pollerService.testConnection(id);
  }

  // Ingestion logs
  @Get(':id/ingestion-logs')
  async getIngestionLogs(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.providerService.getIngestionLogs(
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // Monday.com sync
  @Post('sync-from-monday')
  @HttpCode(HttpStatus.OK)
  async syncFromMonday() {
    return this.mondayService.triggerSync();
  }
}
