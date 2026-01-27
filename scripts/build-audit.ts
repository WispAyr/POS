#!/usr/bin/env ts-node
/**
 * Build Audit Script
 * 
 * This script should be called during build processes to log build events.
 * Usage:
 *   - Start: ts-node scripts/build-audit.ts start <buildType>
 *   - Complete: ts-node scripts/build-audit.ts complete <buildId> <status> [errorMessage]
 * 
 * Example:
 *   ts-node scripts/build-audit.ts start LOCAL
 *   ts-node scripts/build-audit.ts complete build-1234567890 SUCCESS
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BuildService } from '../src/build/build.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const buildService = app.get(BuildService);

    const command = process.argv[2];
    const buildType = process.argv[3] || 'LOCAL';

    try {
        if (command === 'start') {
            const build = await buildService.logBuildStart(buildType);
            console.log(`Build started: ${build.buildId}`);
            process.exit(0);
        } else if (command === 'complete') {
            const buildId = process.argv[3];
            const status = process.argv[4] as 'SUCCESS' | 'FAILED' | 'CANCELLED';
            const errorMessage = process.argv[5];

            if (!buildId || !status) {
                console.error('Usage: complete <buildId> <status> [errorMessage]');
                process.exit(1);
            }

            const build = await buildService.logBuildComplete(buildId, status, {
                errorMessage,
            });
            console.log(`Build completed: ${build.buildId} (${status})`);
            process.exit(0);
        } else {
            console.error('Usage: build-audit.ts <start|complete> [args...]');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

bootstrap();
