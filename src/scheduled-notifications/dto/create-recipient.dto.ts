import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { RecipientType } from '../entities/notification-recipient.entity';

export class CreateRecipientDto {
  @IsEnum(RecipientType)
  type: RecipientType;

  @IsString()
  name: string;

  @IsString()
  identifier: string;

  @IsString()
  @IsOptional()
  telegramUsername?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateRecipientDto {
  @IsEnum(RecipientType)
  @IsOptional()
  type?: RecipientType;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  identifier?: string;

  @IsString()
  @IsOptional()
  telegramUsername?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
