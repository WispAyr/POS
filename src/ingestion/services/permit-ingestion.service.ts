import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Permit, PermitType } from '../../domain/entities';
import { IngestPermitDto } from '../dto/ingest-permit.dto';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class PermitIngestionService {
  private readonly logger = new Logger(PermitIngestionService.name);

  constructor(
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    private readonly auditService: AuditService,
  ) {}

  async ingest(dto: IngestPermitDto): Promise<Permit> {
    // Validate and map type string to PermitType enum
    const typeValue = dto.type?.toUpperCase() as PermitType;
    const validType = Object.values(PermitType).includes(typeValue)
      ? typeValue
      : PermitType.WHITELIST;

    const permitData: DeepPartial<Permit> = {
      siteId: dto.siteId || undefined,
      vrm: dto.vrm.toUpperCase().replace(/\s/g, ''),
      type: validType,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : (null as any),
    };

    const permit = this.permitRepo.create(permitData);
    const saved = await this.permitRepo.save(permit);

    this.logger.log(`Ingested permit: ${saved.id} for VRM ${saved.vrm}`);

    // Audit log permit ingestion
    await this.auditService.logPermitIngestion(saved);

    return saved;
  }
}
