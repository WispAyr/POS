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

export class CreateAlarmDefinitionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(AlarmType)
  type: AlarmType;

  @IsEnum(AlarmSeverity)
  @IsOptional()
  severity?: AlarmSeverity;

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

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  notificationChannels?: NotificationChannel[];
}
