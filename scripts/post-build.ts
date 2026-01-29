#!/usr/bin/env ts-node
/**
 * Post-Build Script
 *
 * Logs build completion after successful build.
 * This should be called after npm run build completes successfully.
 *
 * Note: In CI environments (when CI=true), this script skips database operations
 * and exits successfully to allow builds to proceed without a database connection.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BuildService } from '../src/build/build.service';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

async function bootstrap() {
  // Skip build audit in CI environments where database is not available
  if (process.env.CI === 'true' || process.env.SKIP_BUILD_AUDIT === 'true') {
    console.log('Skipping post-build audit (CI environment detected)');
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
    const buildService = app.get(BuildService);

    try {
        // Get the latest build (should be the one we just started)
        const latestBuild = await buildService.getLatestBuild('LOCAL');
        
        if (!latestBuild || latestBuild.status !== 'STARTED') {
            // Create a new build record if none exists
            const build = await buildService.logBuildStart('LOCAL');
            const buildId = build.buildId;
            
            // Check if build artifacts exist
            const artifacts: string[] = [];
            if (existsSync(join(process.cwd(), 'dist'))) {
                artifacts.push('dist/');
            }
            if (existsSync(join(process.cwd(), 'frontend', 'dist'))) {
                artifacts.push('frontend/dist/');
            }

            // Get test results if available
            let testResults;
            const coveragePath = join(process.cwd(), 'coverage', 'coverage-summary.json');
            if (existsSync(coveragePath)) {
                try {
                    const coverage = JSON.parse(readFileSync(coveragePath, 'utf-8'));
                    testResults = {
                        total: 0,
                        passed: 0,
                        failed: 0,
                        skipped: 0,
                        coverage: {
                            lines: coverage.total?.lines?.pct || 0,
                            branches: coverage.total?.branches?.pct || 0,
                            functions: coverage.total?.functions?.pct || 0,
                            statements: coverage.total?.statements?.pct || 0,
                        },
                    };
                } catch (e) {
                    // Ignore coverage parsing errors
                }
            }

            await buildService.logBuildComplete(buildId, 'SUCCESS', {
                artifacts,
                testResults,
            });

            console.log(`Build logged: ${buildId}`);
        } else {
            // Complete the existing build
            const artifacts: string[] = [];
            if (existsSync(join(process.cwd(), 'dist'))) {
                artifacts.push('dist/');
            }
            if (existsSync(join(process.cwd(), 'frontend', 'dist'))) {
                artifacts.push('frontend/dist/');
            }

            await buildService.logBuildComplete(latestBuild.buildId, 'SUCCESS', {
                artifacts,
            });

            console.log(`Build completed: ${latestBuild.buildId}`);
        }
    } catch (error) {
        console.error('Error logging build:', error);
        process.exit(1);
    } finally {
        await app.close();
    }
}

bootstrap();
