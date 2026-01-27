import { IsString, IsDateString, IsNumber, IsOptional } from 'class-validator';

export class IngestPaymentDto {
    @IsString()
    siteId: string;

    @IsString()
    vrm: string;

    @IsNumber()
    amount: number;

    @IsDateString()
    startTime: string;

    @IsDateString()
    expiryTime: string;

    @IsString()
    source: string;

    @IsString()
    @IsOptional()
    externalReference?: string;
}
