import { Controller, Get } from '@nestjs/common';
import { OperationsDashboardService } from './operations-dashboard.service';
import { OperationsDashboardResponse } from './operations-dashboard.types';

@Controller('api/operations')
export class OperationsDashboardController {
  constructor(
    private readonly dashboardService: OperationsDashboardService,
  ) {}

  /**
   * Get comprehensive operations dashboard data
   * Designed for real-time display screens
   */
  @Get('dashboard')
  async getDashboard(): Promise<OperationsDashboardResponse> {
    return this.dashboardService.getDashboardData();
  }
}
