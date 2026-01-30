import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  body: string;

  @IsArray()
  @IsString({ each: true })
  variables: string[];

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
