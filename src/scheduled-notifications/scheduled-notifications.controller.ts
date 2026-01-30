import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ScheduledNotificationService } from './services/scheduled-notification.service';
import { NotificationSchedulerService } from './services/notification-scheduler.service';
import { ScheduledActionService } from './services/scheduled-action.service';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { TelegramDeliveryService } from './services/telegram-delivery.service';
import { TemplateRendererService } from './services/template-renderer.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';
import { CreateRecipientDto, UpdateRecipientDto } from './dto/create-recipient.dto';
import {
  CreateScheduledNotificationDto,
  UpdateScheduledNotificationDto,
} from './dto/create-scheduled-notification.dto';
import {
  CreateScheduledActionDto,
  UpdateScheduledActionDto,
} from './dto/create-scheduled-action.dto';

@Controller('api/scheduled-notifications')
export class ScheduledNotificationsController {
  constructor(
    private readonly notificationService: ScheduledNotificationService,
    private readonly schedulerService: NotificationSchedulerService,
    private readonly actionService: ScheduledActionService,
    private readonly metricsService: MetricsCollectorService,
    private readonly telegramService: TelegramDeliveryService,
    private readonly templateRenderer: TemplateRendererService,
  ) {}

  // ============ Templates ============

  @Get('templates')
  async listTemplates() {
    return this.notificationService.getAllTemplates();
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.notificationService.createTemplate(dto);
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return this.notificationService.getTemplateById(id);
  }

  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.notificationService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@Param('id') id: string) {
    await this.notificationService.deleteTemplate(id);
  }

  @Post('templates/:id/preview')
  @HttpCode(HttpStatus.OK)
  async previewTemplate(
    @Param('id') id: string,
    @Body() body: { variableConfig: Record<string, any>; siteId?: string },
  ) {
    const template = await this.notificationService.getTemplateById(id);
    const rendered = await this.templateRenderer.renderTemplate(
      template.body,
      body.variableConfig,
      body.siteId,
    );
    return { rendered, original: template.body };
  }

  // ============ Recipients ============

  @Get('recipients')
  async listRecipients() {
    return this.notificationService.getAllRecipients();
  }

  @Post('recipients')
  @HttpCode(HttpStatus.CREATED)
  async createRecipient(@Body() dto: CreateRecipientDto) {
    return this.notificationService.createRecipient(dto);
  }

  @Get('recipients/:id')
  async getRecipient(@Param('id') id: string) {
    return this.notificationService.getRecipientById(id);
  }

  @Put('recipients/:id')
  async updateRecipient(@Param('id') id: string, @Body() dto: UpdateRecipientDto) {
    return this.notificationService.updateRecipient(id, dto);
  }

  @Delete('recipients/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecipient(@Param('id') id: string) {
    await this.notificationService.deleteRecipient(id);
  }

  @Post('recipients/sync-telegram')
  @HttpCode(HttpStatus.OK)
  async syncTelegramRecipients() {
    return this.notificationService.syncTelegramRecipients();
  }

  // ============ Scheduled Notifications ============

  @Get()
  async listNotifications() {
    return this.notificationService.getAllNotifications();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createNotification(@Body() dto: CreateScheduledNotificationDto) {
    const notification = await this.notificationService.createNotification(dto);
    await this.schedulerService.refreshScheduledNotifications();
    return notification;
  }

  @Get(':id')
  async getNotification(@Param('id') id: string) {
    return this.notificationService.getNotificationById(id);
  }

  @Put(':id')
  async updateNotification(
    @Param('id') id: string,
    @Body() dto: UpdateScheduledNotificationDto,
  ) {
    const notification = await this.notificationService.updateNotification(id, dto);
    await this.schedulerService.refreshScheduledNotifications();
    return notification;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNotification(@Param('id') id: string) {
    await this.notificationService.deleteNotification(id);
    await this.schedulerService.refreshScheduledNotifications();
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testNotification(@Param('id') id: string) {
    return this.schedulerService.runManualNotification(id);
  }

  // ============ Delivery History ============

  @Get(':id/history')
  async getDeliveryHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationService.getDeliveryHistory(id, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  // ============ Metrics ============

  @Get('metrics/available')
  async getAvailableMetrics() {
    return this.metricsService.getAvailableMetrics();
  }

  @Get('metrics/current')
  async getCurrentMetrics(@Query('siteId') siteId?: string) {
    return this.metricsService.collectAllMetrics(siteId);
  }

  @Get('metrics/:key')
  async getMetric(@Param('key') key: string, @Query('siteId') siteId?: string) {
    const value = await this.metricsService.collectMetric(key, siteId);
    return { key, value };
  }

  // ============ Actions ============

  @Get('actions')
  async listActions() {
    return this.actionService.getAllActions();
  }

  @Post('actions')
  @HttpCode(HttpStatus.CREATED)
  async createAction(@Body() dto: CreateScheduledActionDto) {
    return this.actionService.createAction(dto);
  }

  @Get('actions/:id')
  async getAction(@Param('id') id: string) {
    return this.actionService.getActionById(id);
  }

  @Put('actions/:id')
  async updateAction(@Param('id') id: string, @Body() dto: UpdateScheduledActionDto) {
    return this.actionService.updateAction(id, dto);
  }

  @Delete('actions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAction(@Param('id') id: string) {
    await this.actionService.deleteAction(id);
  }

  @Post('actions/:id/run')
  @HttpCode(HttpStatus.OK)
  async runAction(@Param('id') id: string) {
    return this.actionService.runManualAction(id);
  }

  // ============ Scheduler Status ============

  @Get('scheduler/status')
  async getSchedulerStatus() {
    return {
      notifications: this.schedulerService.getScheduledNotifications(),
      actions: this.actionService.getScheduledActions(),
    };
  }

  // ============ Telegram Status ============

  @Get('telegram/health')
  async getTelegramHealth() {
    const healthy = await this.telegramService.checkHealth();
    return { healthy };
  }

  @Get('telegram/recipients')
  async getTelegramRecipients() {
    return this.telegramService.getRecipients();
  }
}
