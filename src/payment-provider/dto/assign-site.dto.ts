import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';

export class AssignSiteDto {
  @IsString()
  siteId: string;

  @IsObject()
  @IsOptional()
  siteMapping?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
