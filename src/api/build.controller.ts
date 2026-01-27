import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { BuildService } from '../build/build.service';

@Controller('api/build')
export class BuildController {
    constructor(private readonly buildService: BuildService) { }

    @Get('version')
    async getVersion() {
        return this.buildService.getVersionInfo();
    }

    @Get('history')
    async getBuildHistory(
        @Query('buildType') buildType?: string,
        @Query('status') status?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.buildService.getBuildHistory({
            buildType,
            status,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
        });
    }

    @Get('latest')
    async getLatestBuild(@Query('buildType') buildType?: string) {
        return this.buildService.getLatestBuild(buildType);
    }

    @Get('version-history')
    async getVersionHistory() {
        return this.buildService.getVersionHistory();
    }

    @Get(':buildId')
    async getBuildById(@Param('buildId') buildId: string) {
        return this.buildService.getBuildById(buildId);
    }

    @Post('audit/ci')
    async auditCiBuild(@Body() body: { workflow: string; runId: string; status: string }) {
        const buildId = `ci-${body.runId}`;
        const status = body.status === 'success' ? 'SUCCESS' : body.status === 'failure' ? 'FAILED' : 'CANCELLED';
        
        // Try to find existing build or create new one
        let build = await this.buildService.getBuildById(buildId);
        
        if (!build) {
            build = await this.buildService.logBuildStart('CI', 'GITHUB_ACTIONS', 'CI');
        }
        
        return this.buildService.logBuildComplete(buildId, status, {
            errorMessage: body.status !== 'success' ? `CI workflow ${body.workflow} failed` : undefined,
        });
    }
}
