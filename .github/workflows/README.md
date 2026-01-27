# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD automation.

## Workflows

### 1. `ci.yml` - Main CI Pipeline

**Triggers:**
- Push to `main`, `develop`, or `master`
- Pull requests
- Manual dispatch

**Jobs:**
- **Lint & Format Check** - Runs ESLint and Prettier checks
- **Build** - Builds both backend and frontend
- **Backend Tests** - Runs unit, integration, and E2E tests
- **Frontend Tests** - Runs frontend tests and build
- **Type Check** - TypeScript type checking for both projects

**Status Badge:**
```markdown
![CI](https://github.com/YOUR_USERNAME/POS/workflows/CI/badge.svg)
```

### 2. `test.yml` - Test Suite

**Triggers:**
- Push to `main`, `develop`, or `master`
- Pull requests
- Manual dispatch

**Jobs:**
- **Backend Tests** - Full test suite with PostgreSQL service
- **Frontend Tests** - Frontend tests and build verification

**Features:**
- PostgreSQL service container for integration/E2E tests
- Coverage report generation
- Codecov integration (optional)

### 3. `security.yml` - Security Scanning

**Triggers:**
- Push to main branches
- Pull requests
- Weekly schedule (Monday 00:00 UTC)
- Manual dispatch

**Jobs:**
- **Dependency Audit** - npm audit for vulnerabilities
- **CodeQL Analysis** - Static code analysis

### 4. `pr-checks.yml` - Pull Request Validation

**Triggers:**
- Pull request opened, synchronized, or reopened

**Checks:**
- TODO/FIXME comments detection
- console.log detection
- package.json validation
- Large file detection

### 5. `release.yml` - Release Workflow

**Triggers:**
- Push of version tags (e.g., `v1.0.0`)
- Manual dispatch with version input

**Jobs:**
- **Build and Test** - Full test suite and build
- **Create Release** - Creates GitHub release

### 6. `dependabot-auto-merge.yml` - Auto-merge Dependencies

**Triggers:**
- Dependabot pull requests

**Features:**
- Waits for CI to pass
- Auto-merges Dependabot PRs

## Setup

### Required Secrets

1. **CODECOV_TOKEN** (optional)
   - For coverage reporting
   - Get from [codecov.io](https://codecov.io)

### Environment Variables

Test database configuration is set in workflow files:
- `TEST_DB_HOST`: localhost (PostgreSQL service)
- `TEST_DB_PORT`: 5432
- `TEST_DB_USERNAME`: pos_test_user
- `TEST_DB_PASSWORD`: pos_test_pass
- `TEST_DB_DATABASE`: pos_test_db

### Dependabot Configuration

Dependabot is configured in `.github/dependabot.yml`:
- Weekly updates for backend and frontend dependencies
- GitHub Actions updates
- Auto-labeling and reviewers

**To enable:**
1. Update `.github/dependabot.yml` with your GitHub username
2. Dependabot will automatically create PRs

## Workflow Status

View workflow status:
- GitHub Actions tab in repository
- Status badges in README

## Troubleshooting

### Tests Failing

1. Check PostgreSQL service is running
2. Verify test database credentials
3. Check test logs for specific errors

### Build Failures

1. Check Node.js version (should be 20)
2. Verify all dependencies are installed
3. Check for TypeScript errors

### Coverage Not Uploading

1. Verify CODECOV_TOKEN secret is set (optional)
2. Check coverage report is generated
3. Review Codecov action logs

## Customization

### Adding New Workflows

1. Create `.yml` file in `.github/workflows/`
2. Follow existing workflow patterns
3. Test locally with [act](https://github.com/nektos/act) if needed

### Modifying Triggers

Edit the `on:` section in workflow files:
```yaml
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  workflow_dispatch: # Manual trigger
```

### Adding New Jobs

Follow the pattern:
```yaml
jobs:
  job-name:
    runs-on: ubuntu-latest
    steps:
      - name: Step name
        run: command
```

## Best Practices

1. **Keep workflows fast** - Use caching and parallel jobs
2. **Fail fast** - Use `continue-on-error: false` for critical steps
3. **Use secrets** - Never hardcode sensitive data
4. **Test locally** - Use `act` or similar tools
5. **Document changes** - Update this README when adding workflows

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [NestJS CI/CD Guide](https://docs.nestjs.com/recipes/ci-cd)
- [Testing Guide](../TESTING.md)
