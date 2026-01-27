import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permit } from '../domain/entities/permit.entity';

@Controller('api/permits')
export class PermitsController {
    constructor(
        @InjectRepository(Permit)
        private readonly permitRepo: Repository<Permit>,
    ) { }

    @Get()
    async findAll(
        @Query('siteId') siteId?: string,
        @Query('vrm') vrm?: string,
    ) {
        const where: any = {};
        if (siteId) where.siteId = siteId;
        if (vrm) where.vrm = vrm.toUpperCase().replace(/\s/g, '');

        return this.permitRepo.find({
            where,
            order: { createdAt: 'DESC' },
        });
    }

    @Post()
    async create(@Body() data: Partial<Permit>) {
        if (data.vrm) {
            data.vrm = data.vrm.toUpperCase().replace(/\s/g, '');
        }
        const permit = this.permitRepo.create({
            ...data,
            startDate: data.startDate ? new Date(data.startDate) : new Date(),
            endDate: data.endDate ? new Date(data.endDate) : null,
        });
        return this.permitRepo.save(permit);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() data: Partial<Permit>) {
        if (data.vrm) {
            data.vrm = data.vrm.toUpperCase().replace(/\s/g, '');
        }
        await this.permitRepo.update(id, data);
        return this.permitRepo.findOne({ where: { id } });
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.permitRepo.delete(id);
        return { deleted: true };
    }
}
