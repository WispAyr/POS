import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site, PaymentProviderSite } from '../domain/entities';

@Controller('api/sites')
export class SitesController {
  constructor(
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(PaymentProviderSite)
    private readonly providerSiteRepo: Repository<PaymentProviderSite>,
  ) {}

  /**
   * List all sites
   */
  @Get()
  async listSites(@Query('active') activeStr?: string) {
    const where: any = {};
    if (activeStr === 'true') {
      where.active = true;
    } else if (activeStr === 'false') {
      where.active = false;
    }

    return this.siteRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  /**
   * List sites that have payment provider mappings (for payment tracking)
   */
  @Get('with-payments')
  async listSitesWithPayments() {
    // Get distinct siteIds from payment provider site mappings
    const mappings = await this.providerSiteRepo.find({
      where: { active: true },
      select: ['siteId'],
    });
    
    const siteIds = [...new Set(mappings.map(m => m.siteId))];
    
    if (siteIds.length === 0) {
      return [];
    }

    // Get the actual site records for these IDs
    const sites = await this.siteRepo
      .createQueryBuilder('site')
      .where('site.id IN (:...siteIds)', { siteIds })
      .orderBy('site.name', 'ASC')
      .getMany();

    return sites;
  }

  /**
   * Get a single site by ID
   */
  @Get(':id')
  async getSite(@Param('id') id: string) {
    const site = await this.siteRepo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return site;
  }

  /**
   * Get site config
   */
  @Get(':id/config')
  async getSiteConfig(@Param('id') id: string) {
    const site = await this.siteRepo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return site.config || {};
  }

  /**
   * Update site config (merge with existing)
   */
  @Patch(':id/config')
  async updateSiteConfig(
    @Param('id') id: string,
    @Body() configUpdate: Record<string, any>,
  ) {
    const site = await this.siteRepo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }

    // Merge the config update with existing config
    const existingConfig = site.config || {};
    site.config = { ...existingConfig, ...configUpdate } as typeof site.config;

    await this.siteRepo.save(site);

    return site;
  }

  /**
   * Replace entire site config
   */
  @Patch(':id/config/replace')
  async replaceSiteConfig(
    @Param('id') id: string,
    @Body() config: Record<string, any>,
  ) {
    const site = await this.siteRepo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }

    site.config = config as typeof site.config;
    await this.siteRepo.save(site);

    return site;
  }

  /**
   * Add or update a camera in site config
   */
  @Patch(':id/cameras')
  async updateCamera(
    @Param('id') id: string,
    @Body() camera: Record<string, any>,
  ) {
    const site = await this.siteRepo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }

    const config = site.config || {};
    const cameras = [...(config.cameras || [])] as any[];
    
    const existingIndex = cameras.findIndex((c: any) => c.id === camera.id);
    if (existingIndex >= 0) {
      cameras[existingIndex] = camera;
    } else {
      cameras.push(camera);
    }

    site.config = { ...config, cameras } as typeof site.config;
    await this.siteRepo.save(site);

    return site;
  }

  /**
   * Delete a camera from site config
   */
  @Patch(':id/cameras/:cameraId/delete')
  async deleteCamera(
    @Param('id') id: string,
    @Param('cameraId') cameraId: string,
  ) {
    const site = await this.siteRepo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }

    const config = site.config || {};
    const cameras = (config.cameras || []).filter((c: any) => c.id !== cameraId);

    site.config = { ...config, cameras } as typeof site.config;
    await this.siteRepo.save(site);

    return site;
  }
}
