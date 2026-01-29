import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaymentProvider,
  PaymentProviderSite,
  PaymentIngestionLog,
} from '../../domain/entities';
import { SyncStatus, PaymentProviderConfig } from '../../domain/entities/payment-provider.types';
import { CreatePaymentProviderDto } from '../dto/create-payment-provider.dto';
import { UpdatePaymentProviderDto } from '../dto/update-payment-provider.dto';
import { AssignSiteDto } from '../dto/assign-site.dto';

@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(
    @InjectRepository(PaymentProvider)
    private readonly providerRepo: Repository<PaymentProvider>,
    @InjectRepository(PaymentProviderSite)
    private readonly providerSiteRepo: Repository<PaymentProviderSite>,
    @InjectRepository(PaymentIngestionLog)
    private readonly ingestionLogRepo: Repository<PaymentIngestionLog>,
  ) {}

  async findAll(): Promise<PaymentProvider[]> {
    return this.providerRepo.find({
      order: { name: 'ASC' },
    });
  }

  async findById(id: string): Promise<PaymentProvider> {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`Payment provider ${id} not found`);
    }
    return provider;
  }

  async findByMondayItemId(mondayItemId: string): Promise<PaymentProvider | null> {
    return this.providerRepo.findOne({ where: { mondayItemId } });
  }

  async findActiveProviders(): Promise<PaymentProvider[]> {
    return this.providerRepo.find({
      where: { active: true },
      order: { name: 'ASC' },
    });
  }

  async create(dto: CreatePaymentProviderDto): Promise<PaymentProvider> {
    const provider = this.providerRepo.create({
      name: dto.name,
      type: dto.type,
      config: dto.config as PaymentProviderConfig,
      active: dto.active ?? true,
      mondayItemId: dto.mondayItemId,
      pollIntervalMinutes: dto.pollIntervalMinutes ?? 5,
    });

    const saved = await this.providerRepo.save(provider);
    this.logger.log(`Created payment provider: ${saved.name} (${saved.id})`);
    return saved;
  }

  async update(id: string, dto: UpdatePaymentProviderDto): Promise<PaymentProvider> {
    const provider = await this.findById(id);

    if (dto.name !== undefined) provider.name = dto.name;
    if (dto.type !== undefined) provider.type = dto.type;
    if (dto.config !== undefined) provider.config = dto.config as PaymentProviderConfig;
    if (dto.active !== undefined) provider.active = dto.active;
    if (dto.mondayItemId !== undefined) provider.mondayItemId = dto.mondayItemId;
    if (dto.pollIntervalMinutes !== undefined) {
      provider.pollIntervalMinutes = dto.pollIntervalMinutes;
    }

    const saved = await this.providerRepo.save(provider);
    this.logger.log(`Updated payment provider: ${saved.name} (${saved.id})`);
    return saved;
  }

  async delete(id: string): Promise<void> {
    const provider = await this.findById(id);
    await this.providerRepo.remove(provider);
    this.logger.log(`Deleted payment provider: ${provider.name} (${id})`);
  }

  async updateSyncStatus(
    id: string,
    status: SyncStatus,
    details?: PaymentProvider['lastSyncDetails'],
  ): Promise<void> {
    await this.providerRepo.update(id, {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncDetails: details,
    });
  }

  // Site assignment methods
  async getAssignedSites(providerId: string): Promise<PaymentProviderSite[]> {
    await this.findById(providerId); // Verify provider exists
    return this.providerSiteRepo.find({
      where: { providerId },
      order: { siteId: 'ASC' },
    });
  }

  async assignSite(providerId: string, dto: AssignSiteDto): Promise<PaymentProviderSite> {
    await this.findById(providerId); // Verify provider exists

    // Check if already assigned
    const existing = await this.providerSiteRepo.findOne({
      where: { providerId, siteId: dto.siteId },
    });

    if (existing) {
      // Update existing assignment
      existing.siteMapping = dto.siteMapping ?? existing.siteMapping;
      existing.active = dto.active ?? existing.active;
      const saved = await this.providerSiteRepo.save(existing);
      this.logger.log(`Updated site assignment: ${providerId} -> ${dto.siteId}`);
      return saved;
    }

    // Create new assignment
    const assignment = this.providerSiteRepo.create({
      providerId,
      siteId: dto.siteId,
      siteMapping: dto.siteMapping,
      active: dto.active ?? true,
    });

    const saved = await this.providerSiteRepo.save(assignment);
    this.logger.log(`Assigned site to provider: ${providerId} -> ${dto.siteId}`);
    return saved;
  }

  async removeSiteAssignment(providerId: string, siteId: string): Promise<void> {
    const assignment = await this.providerSiteRepo.findOne({
      where: { providerId, siteId },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Site assignment not found: ${providerId} -> ${siteId}`,
      );
    }

    await this.providerSiteRepo.remove(assignment);
    this.logger.log(`Removed site assignment: ${providerId} -> ${siteId}`);
  }

  async findSitesByProvider(providerId: string): Promise<PaymentProviderSite[]> {
    return this.providerSiteRepo.find({
      where: { providerId, active: true },
    });
  }

  async findProviderBySiteIdentifier(
    siteIdentifier: string,
  ): Promise<{ provider: PaymentProvider; site: PaymentProviderSite } | null> {
    // Find site mapping that matches the identifier
    const sites = await this.providerSiteRepo.find({
      where: { active: true },
      relations: ['provider'],
    });

    for (const site of sites) {
      if (
        site.siteMapping?.emailSiteIdentifier === siteIdentifier ||
        site.siteMapping?.apiSiteCode === siteIdentifier ||
        site.siteMapping?.webhookSiteId === siteIdentifier ||
        site.siteId === siteIdentifier
      ) {
        return { provider: site.provider, site };
      }
    }

    return null;
  }

  // Ingestion log methods
  async getIngestionLogs(
    providerId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ logs: PaymentIngestionLog[]; total: number }> {
    const [logs, total] = await this.ingestionLogRepo.findAndCount({
      where: { providerId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { logs, total };
  }

  async getIngestionLogById(id: string): Promise<PaymentIngestionLog> {
    const log = await this.ingestionLogRepo.findOne({ where: { id } });
    if (!log) {
      throw new NotFoundException(`Ingestion log ${id} not found`);
    }
    return log;
  }

  async createIngestionLog(
    data: Partial<PaymentIngestionLog>,
  ): Promise<PaymentIngestionLog> {
    const log = this.ingestionLogRepo.create(data);
    return this.ingestionLogRepo.save(log);
  }

  async updateIngestionLog(
    id: string,
    data: Partial<PaymentIngestionLog>,
  ): Promise<PaymentIngestionLog> {
    await this.ingestionLogRepo.update(id, data);
    return this.getIngestionLogById(id);
  }

  async checkEmailDuplicate(emailMessageId: string): Promise<boolean> {
    const existing = await this.ingestionLogRepo.findOne({
      where: { emailMessageId },
    });
    return !!existing;
  }
}
