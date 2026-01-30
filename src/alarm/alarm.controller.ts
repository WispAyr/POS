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
import { AlarmService } from './services/alarm.service';
import { AlarmSchedulerService } from './services/alarm-scheduler.service';
import { AlarmActionService } from './services/alarm-action.service';
import { CreateAlarmDefinitionDto } from './dto/create-alarm-definition.dto';
import { UpdateAlarmDefinitionDto } from './dto/update-alarm-definition.dto';
import { AcknowledgeAlarmDto, ResolveAlarmDto } from './dto/acknowledge-alarm.dto';
import { AlarmActionDto } from './dto/alarm-action.dto';
import { AlarmStatus, AlarmSeverity } from '../domain/entities/alarm.enums';

@Controller('api/alarms')
export class AlarmController {
  constructor(
    private readonly alarmService: AlarmService,
    private readonly schedulerService: AlarmSchedulerService,
    private readonly actionService: AlarmActionService,
  ) {}

  // Alarm Definitions
  @Post('definitions')
  @HttpCode(HttpStatus.CREATED)
  async createDefinition(@Body() dto: CreateAlarmDefinitionDto) {
    const definition = await this.alarmService.createDefinition(dto);
    // Refresh scheduler to pick up new definition
    await this.schedulerService.refreshScheduledDefinitions();
    return definition;
  }

  @Get('definitions')
  async listDefinitions() {
    return this.alarmService.getAllDefinitions();
  }

  @Get('definitions/:id')
  async getDefinition(@Param('id') id: string) {
    return this.alarmService.getDefinitionById(id);
  }

  @Put('definitions/:id')
  async updateDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateAlarmDefinitionDto,
  ) {
    const definition = await this.alarmService.updateDefinition(id, dto);
    // Refresh scheduler to pick up changes
    await this.schedulerService.refreshScheduledDefinitions();
    return definition;
  }

  @Delete('definitions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDefinition(@Param('id') id: string) {
    await this.alarmService.deleteDefinition(id);
    // Refresh scheduler to remove deleted definition
    await this.schedulerService.refreshScheduledDefinitions();
  }

  // Active Alarms
  @Get('active')
  async getActiveAlarms(@Query('siteId') siteId?: string) {
    return this.alarmService.getActiveAlarms(siteId);
  }

  // Alarm History
  @Get('history')
  async getAlarmHistory(
    @Query('siteId') siteId?: string,
    @Query('status') status?: AlarmStatus,
    @Query('severity') severity?: AlarmSeverity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.alarmService.getAlarmHistory({
      siteId,
      status,
      severity,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  // Single Alarm
  @Get(':id')
  async getAlarm(@Param('id') id: string) {
    return this.alarmService.getAlarmById(id);
  }

  // Acknowledge Alarm
  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeAlarm(
    @Param('id') id: string,
    @Body() dto: AcknowledgeAlarmDto,
  ) {
    return this.alarmService.acknowledgeAlarm(id, dto.acknowledgedBy, dto.notes);
  }

  // Resolve Alarm
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveAlarm(@Param('id') id: string, @Body() dto: ResolveAlarmDto) {
    return this.alarmService.resolveAlarm(id, dto.resolvedBy, dto.notes);
  }

  // Manual Trigger (for testing)
  @Post('trigger/:definitionId')
  @HttpCode(HttpStatus.OK)
  async triggerAlarm(@Param('definitionId') definitionId: string) {
    const triggered = await this.schedulerService.runManualCheck(definitionId);
    return {
      triggered,
      message: triggered ? 'Alarm triggered' : 'Conditions not met',
    };
  }

  // Notifications
  @Get('notifications/unread')
  async getUnreadNotifications(@Query('userId') userId?: string) {
    return this.alarmService.getUnreadNotifications(userId);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  async markNotificationAsRead(@Param('id') id: string) {
    return this.alarmService.markNotificationAsRead(id);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  async markAllNotificationsAsRead(@Query('userId') userId?: string) {
    await this.alarmService.markAllNotificationsAsRead(userId);
    return { message: 'All notifications marked as read' };
  }

  @Get('notifications/count')
  async getUnreadCount(@Query('userId') userId?: string) {
    const count = await this.alarmService.getUnreadCount(userId);
    return { count };
  }

  // Statistics
  @Get('stats')
  async getStats() {
    return this.alarmService.getAlarmStats();
  }

  // Scheduler info
  @Get('scheduler/status')
  async getSchedulerStatus() {
    return {
      scheduledChecks: this.schedulerService.getScheduledChecks(),
    };
  }

  // Action Types
  @Get('actions/types')
  getActionTypes() {
    return {
      types: [
        {
          type: 'TELEGRAM',
          label: 'Telegram Notification',
          description: 'Send a message to a Telegram chat',
          configSchema: {
            chatId: { type: 'string', label: 'Chat ID', required: false, description: 'Leave empty for default' },
            message: { type: 'text', label: 'Message Template', required: false, description: 'Use {{alarm.message}}, {{alarm.severity}}' },
            includeDetails: { type: 'boolean', label: 'Include Details', default: true },
          },
        },
        {
          type: 'WEBHOOK',
          label: 'Webhook Call',
          description: 'Make an HTTP request to an external service',
          configSchema: {
            url: { type: 'string', label: 'URL', required: true },
            method: { type: 'select', label: 'Method', options: ['GET', 'POST', 'PUT'], default: 'POST' },
            headers: { type: 'json', label: 'Headers', required: false },
            body: { type: 'json', label: 'Body Template', required: false },
            timeout: { type: 'number', label: 'Timeout (ms)', default: 30000 },
          },
        },
        {
          type: 'ANNOUNCEMENT',
          label: 'Audio Announcement',
          description: 'Play a TTS announcement via AI Horn',
          configSchema: {
            target: { type: 'select', label: 'Target', options: ['horn', 'cameras', 'all'], default: 'horn' },
            message: { type: 'text', label: 'Message', required: true },
            volume: { type: 'number', label: 'Volume (%)', default: 50, min: 0, max: 100 },
          },
        },
      ],
    };
  }

  // Test Action
  @Post('actions/test')
  @HttpCode(HttpStatus.OK)
  async testAction(@Body() action: AlarmActionDto) {
    const result = await this.actionService.testAction(action);
    return result;
  }
}
