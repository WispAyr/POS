import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  IsArray,
} from 'class-validator';
import {
  AlarmType,
  AlarmSeverity,
  NotificationChannel,
} from '../../domain/entities/alarm.enums';

export class UpdateAlarmDefinitionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(AlarmType)
  @IsOptional()
  type?: AlarmType;

  @IsEnum(AlarmSeverity)
  @IsOptional()
  severity?: AlarmSeverity;

  @IsString()
  @IsOptional()
  siteId?: string;

  @IsObject()
  @IsOptional()
  conditions?: Record<string, any>;

  @IsString()
  @IsOptional()
  cronSchedule?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  notificationChannels?: NotificationChannel[];
}
