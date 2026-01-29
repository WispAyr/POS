import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  IsNumber,
  Min,
} from 'class-validator';
import { PaymentProviderType } from '../../domain/entities/payment-provider.types';

export class UpdatePaymentProviderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(PaymentProviderType)
  @IsOptional()
  type?: PaymentProviderType;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsString()
  @IsOptional()
  mondayItemId?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  pollIntervalMinutes?: number;
}
