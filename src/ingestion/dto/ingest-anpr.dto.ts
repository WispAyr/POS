import {
  IsString,
  IsDateString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AnprImageDto {
  @IsString()
  url: string;

  @IsString()
  type: 'plate' | 'overview';
}

export class IngestAnprDto {
  @IsString()
  @IsOptional()
  source?: string; // Internal use

  @IsString()
  @IsOptional()
  clusterId?: string;

  @IsString()
  @IsOptional()
  cameraType?: string; // From Camera (hikvision, axis)

  @IsString()
  siteId: string;

  @IsString()
  @IsOptional()
  vrm?: string;

  @IsString()
  @IsOptional()
  plateNumber?: string; // From actual payload

  @IsDateString()
  timestamp: string;

  @IsNumber()
  @IsOptional()
  confidence?: number;

  @IsString()
  @IsOptional()
  cameraId?: string;

  @IsString()
  @IsOptional()
  direction?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnprImageDto)
  @IsOptional()
  images?: AnprImageDto[];

  @IsOptional()
  metadata?: any;
}
