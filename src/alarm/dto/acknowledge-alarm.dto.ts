import { IsString, IsOptional } from 'class-validator';

export class AcknowledgeAlarmDto {
  @IsString()
  acknowledgedBy: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ResolveAlarmDto {
  @IsString()
  resolvedBy: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
