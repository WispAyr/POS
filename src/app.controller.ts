import { Controller, Get } from '@nestjs/common';
import { BuildService } from './build/build.service';

@Controller()
export class AppController {
  constructor(private readonly buildService: BuildService) {}

  @Get()
  getHello(): string {
    return 'Parking Operations System API is running. Access /api/stats for statistics.';
  }

  @Get('version')
  async getVersion() {
    const version = await this.buildService.getVersionInfo();
    return {
      ...version,
      timestamp: new Date().toISOString(),
    };
  }
}
