import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Permit, PermitType } from '../../domain/entities';
import { IngestPermitDto } from '../dto/ingest-permit.dto';
import { AuditService } from '../../audit/audit.service';
import { ReconciliationService } from '../../engine/services/reconciliation.service';

@Injectable()
export class PermitIngestionService {
  private readonly logger = new Logger(PermitIngestionService.name);

  constructor(
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    private readonly auditService: AuditService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  async ingest(dto: IngestPermitDto): Promise<Permit> {
    const permitData: DeepPartial<Permit> = {
      siteId: dto.siteId || undefined,
      vrm: dto.vrm.toUpperCase().replace(/\s/g, ''),
      type: dto.type as PermitType,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : (null as any),
    };

    const permit = this.permitRepo.create(permitData);
    const saved = await this.permitRepo.save(permit);

    this.logger.log(`Ingested permit: ${saved.id} for VRM ${saved.vrm}`);

    // Audit log permit ingestion
    await this.auditService.logPermitIngestion(saved);

    // Trigger reconciliation for enforcement candidates with this VRM
    // This runs asynchronously to not block the ingestion response
    this.reconciliationService
      .reconcilePermit(saved.vrm, saved.siteId || null, saved.active)
      .then((result) => {
        if (result.decisionsUpdated > 0) {
          this.logger.log(
            `Permit reconciliation for ${saved.vrm}: ${result.decisionsUpdated} decisions updated`,
          );
        }
      })
      .catch((err) => {
        this.logger.error(
          `Error reconciling permit ${saved.id}: ${err.message}`,
          err.stack,
        );
      });

    return saved;
  }
}
