# Build History Backfill Guide

## Overview

The build history backfill system allows you to populate the BuildAudit table with historical build data from git commits and version changes. This creates a complete build history even for builds that occurred before the build tracking system was implemented.

## Features

- **Git Commit Analysis** - Extracts build information from git commit history
- **Version Tracking** - Tracks package.json version changes over time
- **Tag Detection** - Identifies tagged releases
- **Smart Filtering** - Only creates builds for significant commits (tags, version changes, major features)
- **Duplicate Prevention** - Skips builds that already exist

## Usage

### Basic Backfill (Last 30 Days, 50 Commits)

```bash
npm run backfill:builds
```

### Backfill All History

```bash
npm run backfill:builds -- --all
```

### Backfill Since Specific Date

```bash
npm run backfill:builds -- --since-date=2026-01-01
```

### Backfill Limited Number of Commits

```bash
npm run backfill:builds -- --limit=100
```

### Combined Options

```bash
npm run backfill:builds -- --since-date=2026-01-01 --limit=200
```

## What Gets Backfilled

### Significant Commits

The script creates build records for:

1. **Tagged Commits** - All git tags (releases)
2. **Version Changes** - Commits that changed package.json version
3. **Feature Commits** - Commits with "feat:" in message
4. **Release Commits** - Commits mentioning "release" or "version"
5. **Build Commits** - Commits mentioning "build" or "deploy"
6. **Merge Commits** - Merge commits

### Build Types

- **DEPLOYMENT** - Tagged releases or release commits
- **CI** - Commits mentioning CI/GitHub
- **LOCAL** - Other significant commits

### Version Information

For each build, the script captures:

- **Backend Version** - From package.json at that commit
- **Frontend Version** - Current version (as fallback)
- **Git Commit** - Full commit hash
- **Git Branch** - Current branch (as fallback)
- **Git Tag** - If commit is tagged

## Build ID Format

Historical builds use the format: `git-{first7chars}`

Example: `git-4d2a381` for commit `4d2a381...`

## Metadata

Each backfilled build includes:

- Commit message
- Commit author
- Commit date
- `backfilled: true` flag

## Example Output

```
Starting build history backfill...

Current version: Backend 0.0.1, Frontend 0.0.0
Current commit: 4d2a381

Fetching package version history...
Found 3 version changes

Fetching git commit history...
Found 25 commits

Filtered to 8 significant commits

✓ Created: git-4d2a381 - test: add comprehensive unit tests...
✓ Created: git-58cb491 - feat: add comprehensive frontend UI...
✓ Created: git-01685b8 - feat: implement real-time payment...
✓ Created: git-ba35f9c - feat: implement comprehensive audit...
✓ Created: git-c03d269 - feat: implement data reconciliation...
✓ Created: git-feef435 - fix: use jest fake timers...
✓ Created: git-8903486 - feat: add comprehensive UI...
✓ Created: git-da9942d - feat: implement comprehensive build...

Backfill Summary:
  Created: 8 builds
  Skipped: 0 builds (already exist)
  Errors: 0 builds
  Total commits processed: 25
  Significant commits: 8
```

## Manual Build Creation

You can also manually create historical builds via the API:

```typescript
// Using BuildService
await buildService.createHistoricalBuild(
    'git-abc1234',
    'DEPLOYMENT',
    {
        backend: '1.0.0',
        frontend: '1.0.0',
        gitCommit: 'abc1234...',
        gitBranch: 'main',
        gitTag: 'v1.0.0',
        buildId: 'git-abc1234',
    },
    new Date('2026-01-27T10:00:00Z'),
    {
        status: 'SUCCESS',
        actor: 'developer',
        actorType: 'USER',
        metadata: {
            commitMessage: 'Release v1.0.0',
        },
    }
);
```

## Best Practices

1. **Run After Major Releases** - Backfill after each major release
2. **Regular Updates** - Run periodically to capture recent builds
3. **Tag Your Releases** - Use git tags for better build tracking
4. **Version Bumps** - Always update package.json version for releases

## Troubleshooting

### No Commits Found

- Check that you're in a git repository
- Verify git log is accessible
- Check date range is correct

### Version Not Found

- The script uses current version as fallback
- For accurate versions, ensure package.json history is available

### Duplicate Builds

- The script automatically skips existing builds
- Check buildId format matches: `git-{hash}`

## Integration with CI/CD

You can integrate backfill into your CI/CD pipeline:

```yaml
# .github/workflows/backfill-builds.yml
name: Backfill Build History

on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
  workflow_dispatch:

jobs:
  backfill:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run backfill:builds -- --all
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_USERNAME: ${{ secrets.DB_USERNAME }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          DB_DATABASE: ${{ secrets.DB_DATABASE }}
```

## API Endpoint

You can also trigger backfill via API (returns instructions):

```bash
POST /api/build/backfill
```

Note: The API endpoint returns instructions rather than executing the backfill, as it requires git access and should be run in the repository context.
