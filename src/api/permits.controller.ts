import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permit } from '../domain/entities/permit.entity';
import { MondayIntegrationService } from '../integration/monday-integration.service';

@Controller('api/permits')
export class PermitsController {
  constructor(
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    private readonly mondayService: MondayIntegrationService,
  ) {}

  @Get()
  async findAll(@Query('siteId') siteId?: string, @Query('vrm') vrm?: string) {
    const where: any = {};
    if (siteId) where.siteId = siteId;
    if (vrm) where.vrm = vrm.toUpperCase().replace(/\s/g, '');

    return this.permitRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  @Post()
  async create(@Body() data: any) {
    const permit = new Permit();
    permit.vrm = (data.vrm || '').toUpperCase().replace(/\s/g, '');
    permit.siteId = data.siteId || null;
    permit.type = data.type || 'WHITELIST';
    permit.startDate = data.startDate ? new Date(data.startDate) : new Date();
    permit.endDate = data.endDate ? new Date(data.endDate) : null;
    permit.active = data.active !== undefined ? data.active : true;

    const saved = await this.permitRepo.save(permit);

    // Push to Monday if it's a whitelist sync candidate
    if (saved.type === 'WHITELIST') {
      await this.mondayService.pushPermitToMonday(saved);
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

    if (updated && updated.type === 'WHITELIST') {
      await this.mondayService.updatePermitOnMonday(updated);
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const permit = await this.permitRepo.findOne({ where: { id } });
    if (permit && permit.mondayItemId && permit.type === 'WHITELIST') {
      await this.mondayService.deletePermitFromMonday(permit.mondayItemId);
    }
    await this.permitRepo.delete(id);
    return { deleted: true };
  }
}
