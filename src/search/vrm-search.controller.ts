import { Controller, Get, Param, Query } from '@nestjs/common';
import { VrmSearchService } from './vrm-search.service';

@Controller('api/search')
export class VrmSearchController {
  constructor(private readonly searchService: VrmSearchService) {}

  /**
   * Full VRM search - returns comprehensive vehicle data
   */
  @Get('vrm/:vrm')
  async searchVrm(@Param('vrm') vrm: string) {
    return this.searchService.search(vrm);
  }

  /**
   * Quick VRM check - returns status flags only (faster)
   */
  @Get('vrm/:vrm/quick')
  async quickCheckVrm(@Param('vrm') vrm: string) {
    return this.searchService.quickCheck(vrm);
  }
}
