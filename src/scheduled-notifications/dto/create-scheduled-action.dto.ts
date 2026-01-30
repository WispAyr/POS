import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { ActionType } from '../entities/scheduled-action.entity';
import type { MondayActionConfig } from '../entities/scheduled-action.entity';

export class CreateScheduledActionDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ActionType)
  actionType: ActionType;

  @IsString()
  cronSchedule: string;

  @IsObject()
  config: MondayActionConfig;

  @IsString()
  @IsOptional()
  siteId?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateScheduledActionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ActionType)
  @IsOptional()
  actionType?: ActionType;

  @IsString()
  @IsOptional()
  cronSchedule?: string;

  @IsObject()
  @IsOptional()
  config?: MondayActionConfig;

  @IsString()
  @IsOptional()
  siteId?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
