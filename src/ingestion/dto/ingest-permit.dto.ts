import { IsString, IsDateString, IsOptional } from 'class-validator';

export class IngestPermitDto {
  @IsString()
  @IsOptional()
  siteId?: string;

  @IsString()
  vrm: string;

  @IsString()
  type: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
