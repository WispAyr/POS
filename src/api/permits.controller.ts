import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Permit, PermitType } from '../domain/entities/permit.entity';
import { MondayIntegrationService } from '../integration/monday-integration.service';
import { ReconciliationService } from '../engine/services/reconciliation.service';

interface CreatePermitDto {
  vrm: string;
  siteId?: string | null;
  type?: PermitType;
  startDate?: string | Date;
  endDate?: string | Date | null;
  active?: boolean;
}

@Controller('api/permits')
export class PermitsController {
  private readonly logger = new Logger(PermitsController.name);

  constructor(
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    private readonly mondayService: MondayIntegrationService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Get()
  async findAll(@Query('siteId') siteId?: string, @Query('vrm') vrm?: string) {
    const where: FindOptionsWhere<Permit> = {};
    if (siteId) where.siteId = siteId;
    if (vrm) where.vrm = vrm.toUpperCase().replace(/\s/g, '');

    return this.permitRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  @Post()
  async create(@Body() data: CreatePermitDto) {
    const permit = new Permit();
    permit.vrm = (data.vrm || '').toUpperCase().replace(/\s/g, '');
    permit.siteId = data.siteId || null;
    permit.type = data.type || PermitType.WHITELIST;
    permit.startDate = data.startDate ? new Date(data.startDate) : new Date();
    permit.endDate = data.endDate ? new Date(data.endDate) : null;
    permit.active = data.active !== undefined ? data.active : true;

    const saved = await this.permitRepo.save(permit);

    // Push to Monday if it's a whitelist sync candidate
    if (saved.type === PermitType.WHITELIST) {
      await this.mondayService.pushPermitToMonday(saved);
    }

    // Trigger reconciliation for enforcement candidates with this VRM
    if (saved.active) {
      this.reconciliationService
        .reconcilePermit(saved.vrm, saved.siteId, saved.active)
        .then((result) => {
          if (result.decisionsUpdated > 0) {
            this.logger.log(
              `Permit reconciliation for ${saved.vrm}: ${result.decisionsUpdated} decisions updated`,
            );
          }
        })
        .catch((err) => {
          this.logger.error(`Error reconciling permit: ${err.message}`);
        });
    }

    return saved;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: Partial<Permit>) {
    if (data.vrm) {
      data.vrm = data.vrm.toUpperCase().replace(/\s/g, '');
    }
    await this.permitRepo.update(id, data);
    const updated = await this.permitRepo.findOne({ where: { id } });

    if (updated && updated.type === PermitType.WHITELIST) {
      await this.mondayService.updatePermitOnMonday(updated);
    }

    // Trigger reconciliation if permit became active or VRM changed
    if (updated && updated.active) {
      this.reconciliationService
        .reconcilePermit(updated.vrm, updated.siteId, updated.active)
        .then((result) => {
          if (result.decisionsUpdated > 0) {
            this.logger.log(
              `Permit update reconciliation for ${updated.vrm}: ${result.decisionsUpdated} decisions updated`,
            );
          }
        })
        .catch((err) => {
          this.logger.error(`Error reconciling permit update: ${err.message}`);
        });
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const permit = await this.permitRepo.findOne({ where: { id } });
    if (permit && permit.mondayItemId && permit.type === PermitType.WHITELIST) {
      await this.mondayService.deletePermitFromMonday(permit.mondayItemId);
    }
    await this.permitRepo.delete(id);
    return { deleted: true };
  }
}
