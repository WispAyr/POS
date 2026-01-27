#!/usr/bin/env ts-node
/**
 * Build History Backfill Script
 * 
 * This script backfills build history from git commits and package.json versions.
 * It creates BuildAudit records for historical builds based on:
 * - Git commit history
 * - Package.json version changes
 * - Tagged releases
 * 
 * Usage:
 *   ts-node scripts/backfill-build-history.ts [--since-date=YYYY-MM-DD] [--limit=N] [--all]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BuildService } from '../src/build/build.service';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface GitCommit {
    hash: string;
    date: Date;
    message: string;
    author: string;
    tag?: string;
}

interface PackageVersion {
    version: string;
    commitHash: string;
    date: Date;
}

async function getGitCommits(sinceDate?: Date, limit?: number): Promise<GitCommit[]> {
    try {
        let command = 'git log --pretty=format:"%H|%ai|%an|%s" --date=iso';
        
        if (sinceDate) {
            command += ` --since="${sinceDate.toISOString()}"`;
        }
        
        if (limit) {
            command += ` -n ${limit}`;
        }

        const output = execSync(command, { encoding: 'utf-8' });
        const commits: GitCommit[] = [];

        for (const line of output.trim().split('\n')) {
            if (!line) continue;
            const [hash, dateStr, author, ...messageParts] = line.split('|');
            const message = messageParts.join('|');
            commits.push({
                hash: hash.trim(),
                date: new Date(dateStr.trim()),
                message: message.trim(),
                author: author.trim(),
            });
        }

        // Get tags for commits
        for (const commit of commits) {
            try {
                const tagOutput = execSync(`git describe --tags --exact-match ${commit.hash} 2>/dev/null || echo ""`, { encoding: 'utf-8' }).trim();
                if (tagOutput) {
                    commit.tag = tagOutput;
                }
            } catch {
                // No tag for this commit
            }
        }

        return commits;
    } catch (error) {
        console.error('Failed to get git commits:', error);
        return [];
    }
}

async function getPackageVersions(): Promise<PackageVersion[]> {
    const versions: PackageVersion[] = [];
    
    try {
        // Get commits that changed package.json
        const output = execSync('git log --pretty=format:"%H|%ai" --date=iso --all -- package.json', { encoding: 'utf-8' });
        
        for (const line of output.trim().split('\n')) {
            if (!line) continue;
            const [hash, dateStr] = line.split('|');
            
            try {
                // Checkout the commit temporarily to read package.json
                const packageJsonContent = execSync(`git show ${hash.trim()}:package.json 2>/dev/null`, { encoding: 'utf-8' });
                const packageJson = JSON.parse(packageJsonContent);
                
                if (packageJson.version) {
                    versions.push({
                        version: packageJson.version,
                        commitHash: hash.trim(),
                        date: new Date(dateStr.trim()),
                    });
                }
            } catch (e) {
                // Skip if can't read package.json for this commit
            }
        }
    } catch (error) {
        console.error('Failed to get package versions:', error);
    }

    return versions.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function getVersionForCommit(commitHash: string, commitDate: Date, versions: PackageVersion[], currentVersion: string): Promise<string> {
    // Find the most recent version change before or at this commit
    const versionForCommit = versions
        .filter(v => v.date <= commitDate)
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    
    return versionForCommit?.version || currentVersion;
}

async function getCurrentVersionInfo(): Promise<{
    backend: string;
    frontend: string;
    gitCommit: string;
    gitBranch: string;
    gitTag?: string;
}> {
    const backendPackageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const frontendPackageJsonPath = join(process.cwd(), 'frontend', 'package.json');
    const frontendVersion = existsSync(frontendPackageJsonPath)
        ? JSON.parse(readFileSync(frontendPackageJsonPath, 'utf-8')).version
        : '0.0.0';

    const gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    let gitTag: string | undefined;
    try {
        gitTag = execSync('git describe --tags --exact-match 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim() || undefined;
    } catch {
        // No tag
    }

    return {
        backend: backendPackageJson.version,
        frontend: frontendVersion,
        gitCommit,
        gitBranch,
        gitTag,
    };
}

async function backfillBuildHistory() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const buildService = app.get(BuildService);

    console.log('Starting build history backfill...\n');

    // Get command line arguments
    const args = process.argv.slice(2);
    const sinceDateArg = args.find(arg => arg.startsWith('--since-date='));
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    const allArg = args.includes('--all');
    
    const sinceDate = sinceDateArg ? new Date(sinceDateArg.split('=')[1]) : (allArg ? undefined : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // Default: last 30 days
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : (allArg ? undefined : 50); // Default: last 50 commits

    // Get current version info
    const currentVersion = await getCurrentVersionInfo();
    console.log(`Current version: Backend ${currentVersion.backend}, Frontend ${currentVersion.frontend}`);
    console.log(`Current commit: ${currentVersion.gitCommit.substring(0, 7)}`);
    if (currentVersion.gitTag) {
        console.log(`Current tag: ${currentVersion.gitTag}`);
    }
    console.log('');

    // Get package versions
    console.log('Fetching package version history...');
    const versions = await getPackageVersions();
    console.log(`Found ${versions.length} version changes\n`);

    // Get git commits
    console.log('Fetching git commit history...');
    const commits = await getGitCommits(sinceDate, limit);
    console.log(`Found ${commits.length} commits\n`);

    // Filter to significant commits (tags, version changes, or major features)
    const significantCommits = commits.filter(commit => {
        // Include tagged commits
        if (commit.tag) return true;
        
        // Include commits that changed version
        if (versions.some(v => v.commitHash === commit.hash)) return true;
        
        // Include commits with significant messages
        const message = commit.message.toLowerCase();
        if (message.includes('feat:') || 
            message.includes('release') || 
            message.includes('version') ||
            message.includes('build') ||
            message.includes('deploy')) {
            return true;
        }
        
        // Include merge commits
        if (message.includes('merge')) return true;
        
        return false;
    });

    console.log(`Filtered to ${significantCommits.length} significant commits\n`);

    // Create build records
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const commit of significantCommits) {
        const buildId = `git-${commit.hash.substring(0, 7)}`;
        
        // Skip if build already exists
        const existingBuild = await buildService.getBuildById(buildId);
        if (existingBuild) {
            skipped++;
            continue;
        }

        // Determine build type
        let buildType = 'LOCAL';
        if (commit.tag) {
            buildType = 'DEPLOYMENT';
        } else if (commit.message.toLowerCase().includes('ci') || commit.message.toLowerCase().includes('github')) {
            buildType = 'CI';
        } else if (commit.message.toLowerCase().includes('release') || commit.message.toLowerCase().includes('version')) {
            buildType = 'DEPLOYMENT';
        }

        // Get version for this commit
        const version = await getVersionForCommit(commit.hash, commit.date, versions, currentVersion.backend);

        const versionInfo = {
            backend: version,
            frontend: currentVersion.frontend,
            gitCommit: commit.hash,
            gitBranch: currentVersion.gitBranch,
            gitTag: commit.tag,
            buildId,
        };

        try {
            await buildService.createHistoricalBuild(
                buildId,
                buildType,
                versionInfo,
                commit.date,
                {
                    status: 'SUCCESS',
                    actor: commit.author,
                    actorType: 'GIT',
                    metadata: {
                        commitMessage: commit.message,
                        commitAuthor: commit.author,
                        commitDate: commit.date.toISOString(),
                        backfilled: true,
                    },
                }
            );

            created++;
            const tagInfo = commit.tag ? ` [${commit.tag}]` : '';
            console.log(`✓ Created: ${buildId}${tagInfo} - ${commit.message.substring(0, 60)}...`);
        } catch (error: any) {
            errors++;
            console.error(`✗ Failed: ${buildId} - ${error.message}`);
        }
    }

    // Create a build record for current state
    const currentBuildId = `current-${currentVersion.gitCommit.substring(0, 7)}`;
    const latestBuild = await buildService.getLatestBuild();
    
    if (!latestBuild || latestBuild.buildId !== currentBuildId) {
        try {
            const currentVersionInfo = await buildService.getVersionInfo();
            await buildService.logBuildStart('LOCAL', 'SYSTEM', 'SYSTEM');
            const currentBuild = await buildService.getLatestBuild('LOCAL');
            if (currentBuild) {
                await buildService.logBuildComplete(
                    currentBuild.buildId,
                    'SUCCESS',
                    {
                        duration: 0,
                        version: currentVersionInfo,
                    }
                );
                console.log(`✓ Created current build record`);
            }
        } catch (error: any) {
            console.error(`✗ Failed to create current build:`, error.message);
        }
    }

    console.log(`\nBackfill Summary:`);
    console.log(`  Created: ${created} builds`);
    console.log(`  Skipped: ${skipped} builds (already exist)`);
    console.log(`  Errors: ${errors} builds`);
    console.log(`  Total commits processed: ${commits.length}`);
    console.log(`  Significant commits: ${significantCommits.length}`);

    await app.close();
}

backfillBuildHistory().catch(error => {
    console.error('Backfill failed:', error);
    process.exit(1);
});
