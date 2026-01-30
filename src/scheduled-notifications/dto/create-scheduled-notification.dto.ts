import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  IsUUID,
} from 'class-validator';
import { VariableConfig } from '../entities/scheduled-notification.entity';

export class CreateScheduledNotificationDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  cronSchedule: string;

  @IsUUID()
  templateId: string;

  @IsArray()
  @IsString({ each: true })
  recipientIds: string[];

  @IsObject()
  variableConfig: Record<string, VariableConfig>;

  @IsString()
  @IsOptional()
  siteId?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateScheduledNotificationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  cronSchedule?: string;

  @IsUUID()
  @IsOptional()
  templateId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  recipientIds?: string[];

  @IsObject()
  @IsOptional()
  variableConfig?: Record<string, VariableConfig>;

  @IsString()
  @IsOptional()
  siteId?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
