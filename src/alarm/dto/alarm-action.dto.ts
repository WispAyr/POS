import { IsString, IsEnum, IsOptional, IsObject, IsBoolean } from 'class-validator';

export enum ActionType {
  TELEGRAM = 'TELEGRAM',
  WEBHOOK = 'WEBHOOK',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export interface TelegramActionConfig {
  chatId: string;
  message?: string; // Template with variables like {{alarm.message}}, {{site.name}}
  includeDetails?: boolean;
}

export interface WebhookActionConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string; // Template JSON
  timeout?: number;
}

export interface AnnouncementActionConfig {
  target: 'cameras' | 'horn' | 'all';
  message: string; // Template
  volume?: number;
  siteId?: string;
}

export interface EmailActionConfig {
  recipients: string[];
  subject?: string;
  bodyTemplate?: string;
}

export interface SmsActionConfig {
  recipients: string[];
  messageTemplate?: string;
}

export type ActionConfig = 
  | TelegramActionConfig 
  | WebhookActionConfig 
  | AnnouncementActionConfig
  | EmailActionConfig
  | SmsActionConfig;

export class AlarmActionDto {
  @IsString()
  name: string;

  @IsEnum(ActionType)
  type: ActionType;

  @IsObject()
  config: ActionConfig;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateAlarmWithActionsDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  type: string;

  @IsString()
  @IsOptional()
  severity?: string;

  @IsString()
  @IsOptional()
  siteId?: string;

  @IsObject()
  conditions: Record<string, any>;

  @IsString()
  @IsOptional()
  cronSchedule?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject({ each: true })
  @IsOptional()
  actions?: AlarmActionDto[];
}
