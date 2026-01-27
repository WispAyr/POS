# Build Audit & Version Tracking System

## Overview

The Build Audit system provides comprehensive tracking of all build processes, version information, and deployment events. It acts as a complete audit trail for the software development lifecycle.

## Features

### 1. Build Event Tracking
- **Build Start** - Logs when builds begin
- **Build Progress** - Tracks build stages
- **Build Completion** - Records success/failure with artifacts
- **Build Duration** - Tracks build time
- **Build Artifacts** - Records generated files

### 2. Version Information
- **Backend Version** - From `package.json`
- **Frontend Version** - From `frontend/package.json`
- **Git Information** - Commit hash, branch, tag
- **Build Number** - CI/CD build identifier
- **Build ID** - Unique build identifier

### 3. Dependency Tracking
- **Production Dependencies** - All runtime dependencies
- **Dev Dependencies** - All development dependencies
- **Version Pinning** - Exact versions used in build

### 4. Build Metadata
- **Environment** - Node.js version, npm version, OS, architecture
- **CI/CD Context** - Workflow name, run ID, job ID
- **Build Output** - Build logs, errors, warnings
- **Test Results** - Test counts, coverage metrics

### 5. Integration Points
- **Local Builds** - Automatic logging via npm scripts
- **CI/CD Pipelines** - GitHub Actions integration
- **Deployment** - Tracks deployment events
- **Testing** - Logs test runs and results

## Database Schema

### BuildAudit Entity

```typescript
{
    id: string;                    // UUID
    buildId: string;               // Unique build identifier
    buildType: string;             // 'LOCAL', 'CI', 'CD', 'DEPLOYMENT', 'TEST', 'LINT'
    status: string;                // 'STARTED', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'CANCELLED'
    version: VersionInfo;          // Version information
    dependencies: DependencyInfo[]; // Dependencies used
    metadata: BuildMetadata;       // Build environment and context
    actor: string;                 // Who/what triggered build
    actorType: string;             // 'SYSTEM', 'USER', 'CI', 'CD'
    ciWorkflow?: string;           // GitHub Actions workflow
    ciRunId?: string;              // GitHub Actions run ID
    ciJobId?: string;              // GitHub Actions job ID
    artifacts: string[];            // Build artifact paths
    testResults?: TestResults;      // Test execution results
    errorMessage?: string;         // Error message if failed
    errorDetails?: any;            // Detailed error information
    timestamp: Date;               // Build start time
    completedAt?: Date;            // Build completion time
    duration?: number;             // Duration in milliseconds
    relatedBuilds?: string[];      // Related build IDs
    parentBuildId?: string;        // Parent build ID
}
```

## API Endpoints

### Version Information

```
GET /api/build/version
```

Returns current version information:
```json
{
    "backend": "0.0.1",
    "frontend": "0.0.0",
    "gitCommit": "abc123...",
    "gitBranch": "main",
    "gitTag": "v1.0.0",
    "buildNumber": "123",
    "buildId": "ci-123"
}
```

### Build History

```
GET /api/build/history?buildType=CI&status=SUCCESS&limit=10
```

Returns build history with optional filters:
- `buildType` - Filter by build type
- `status` - Filter by status
- `limit` - Limit results
- `offset` - Pagination offset
- `startDate` - Start date filter
- `endDate` - End date filter

### Latest Build

```
GET /api/build/latest?buildType=CI
```

Returns the most recent build (optionally filtered by type).

### Version History

```
GET /api/build/version-history
```

Returns all builds with version information, useful for tracking version changes over time.

### Build by ID

```
GET /api/build/:buildId
```

Returns detailed information for a specific build.

### CI Build Audit

```
POST /api/build/audit/ci
```

Endpoint for CI/CD systems to log build events:
```json
{
    "workflow": "CI",
    "runId": "1234567890",
    "status": "success"
}
```

## Usage

### Local Builds

Builds are automatically logged when using `npm run build`:

```bash
npm run build
```

This will:
1. Log build start
2. Execute the build
3. Log build completion with artifacts

### Manual Build Logging

You can manually log builds using the build audit script:

```bash
# Start a build
ts-node scripts/build-audit.ts start LOCAL

# Complete a build
ts-node scripts/build-audit.ts complete build-1234567890 SUCCESS
```

### CI/CD Integration

GitHub Actions workflows can log builds by calling the API endpoint:

```yaml
- name: Log build completion
  run: |
    curl -X POST http://localhost:3000/api/build/audit/ci \
      -H "Content-Type: application/json" \
      -d '{"workflow": "${{ github.workflow }}", "runId": "${{ github.run_id }}", "status": "success"}'
```

## Build Types

- **LOCAL** - Local development builds
- **CI** - Continuous Integration builds
- **CD** - Continuous Deployment builds
- **DEPLOYMENT** - Production deployments
- **TEST** - Test execution runs
- **LINT** - Linting runs
- **SECURITY_SCAN** - Security scanning runs

## Build Status

- **STARTED** - Build has started
- **IN_PROGRESS** - Build is in progress
- **SUCCESS** - Build completed successfully
- **FAILED** - Build failed
- **CANCELLED** - Build was cancelled

## Version Tracking

The system tracks:
- **Package Versions** - From package.json files
- **Git Information** - Commit, branch, tag
- **Build Numbers** - CI/CD build identifiers
- **Build Timestamps** - When builds occurred

This allows you to:
- Track which version is deployed
- Identify when versions changed
- Trace issues to specific builds
- Maintain deployment history

## Dependency Tracking

All dependencies are tracked at build time:
- **Name** - Package name
- **Version** - Exact version used
- **Type** - Production or dev dependency

This enables:
- Dependency change tracking
- Security vulnerability correlation
- Build reproducibility
- Dependency audit trails

## Integration with Audit System

Build audits are integrated with the main audit system:
- Build events can be queried via audit API
- Build information included in audit trails
- Version information available in audit logs

## Best Practices

1. **Always Log Builds** - Use the automated scripts
2. **Track Artifacts** - Include artifact paths in build logs
3. **Record Test Results** - Include test metrics when available
4. **Version Tagging** - Use git tags for releases
5. **CI/CD Integration** - Log all CI/CD builds
6. **Error Details** - Include detailed error information on failures

## Query Examples

### Get all successful CI builds
```
GET /api/build/history?buildType=CI&status=SUCCESS
```

### Get builds in last 7 days
```
GET /api/build/history?startDate=2026-01-20&endDate=2026-01-27
```

### Get latest deployment
```
GET /api/build/latest?buildType=DEPLOYMENT
```

### Get version history
```
GET /api/build/version-history
```

## Maintenance

### Retention Policy
- Build audits should be retained for at least 1 year
- Version history should be retained indefinitely
- Failed builds should be retained longer for analysis

### Archival
- Old build audits can be archived to cold storage
- Version history should remain in active storage
- Artifacts should be retained per retention policy

## Future Enhancements

1. **Build Comparison** - Compare builds side-by-side
2. **Dependency Diff** - Show dependency changes between builds
3. **Build Analytics** - Build performance metrics
4. **Automated Alerts** - Notify on build failures
5. **Build Reports** - Generate build reports
6. **Integration with Monitoring** - Link builds to monitoring data
