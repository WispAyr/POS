# GitHub Actions Setup Guide

This guide will help you set up GitHub Actions for the Parking Operations System.

## Quick Setup

1. **Push to GitHub** - Ensure your repository is on GitHub
2. **Enable Actions** - GitHub Actions are enabled by default
3. **Update Configuration** - Update usernames and secrets as needed
4. **Test** - Push a commit to trigger workflows

## Configuration Steps

### 1. Update Dependabot Configuration

Edit `.github/dependabot.yml` and replace `ewanrichardson` with your GitHub username:

```yaml
reviewers:
  - "your-github-username"
```

### 2. Update Status Badges

Edit `README.md` and replace `YOUR_USERNAME` with your GitHub username:

```markdown
[![CI](https://github.com/your-username/POS/workflows/CI/badge.svg)](https://github.com/your-username/POS/actions)
```

### 3. Optional: Set Up Codecov (Coverage Reporting)

1. Sign up at [codecov.io](https://codecov.io)
2. Add your repository
3. Get your token
4. Add it as a GitHub secret:
   - Go to: Repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `CODECOV_TOKEN`
   - Value: Your Codecov token

**Note:** Coverage reporting will work without this, but won't upload to Codecov.

### 4. Test the Workflows

1. **Create a test branch:**
   ```bash
   git checkout -b test/ci-setup
   ```

2. **Make a small change:**
   ```bash
   echo "# CI Test" >> README.md
   git add README.md
   git commit -m "test: verify CI workflows"
   git push origin test/ci-setup
   ```

3. **Create a Pull Request:**
   - Go to GitHub
   - Create PR from `test/ci-setup` to `main`
   - Watch the workflows run

4. **Check workflow status:**
   - Go to: Repository → Actions tab
   - You should see workflows running

## Workflow Overview

### Main Workflows

1. **CI** (`.github/workflows/ci.yml`)
   - Runs on every push and PR
   - Lints, builds, tests, type-checks
   - Most comprehensive workflow

2. **Tests** (`.github/workflows/test.yml`)
   - Focused on test execution
   - Includes coverage reporting

3. **Security** (`.github/workflows/security.yml`)
   - Weekly security scans
   - Dependency audits
   - CodeQL analysis

4. **PR Checks** (`.github/workflows/pr-checks.yml`)
   - Validates PRs
   - Checks for common issues

5. **Release** (`.github/workflows/release.yml`)
   - Creates releases on version tags
   - Runs full test suite before release

### Workflow Triggers

- **Push** - Runs on push to `main`, `develop`, `master`
- **Pull Request** - Runs on PR creation/updates
- **Manual** - Can be triggered manually from Actions tab
- **Schedule** - Security scans run weekly

## Troubleshooting

### Workflows Not Running

1. **Check Actions are enabled:**
   - Repository → Settings → Actions
   - Ensure "Allow all actions and reusable workflows" is selected

2. **Check branch protection:**
   - Ensure workflows can run on your branch

3. **Check workflow files:**
   - Ensure `.github/workflows/*.yml` files are committed
   - Check YAML syntax is valid

### Tests Failing

1. **PostgreSQL Service:**
   - Workflows use a PostgreSQL service container
   - Check service is starting correctly in logs

2. **Database Connection:**
   - Verify test database credentials match workflow config
   - Check environment variables are set

3. **Test Data:**
   - Ensure test data generators are working
   - Check for test data cleanup issues

### Build Failures

1. **Node Version:**
   - Workflows use Node.js 20
   - Ensure your code is compatible

2. **Dependencies:**
   - Check `package.json` is valid
   - Verify all dependencies are available

3. **TypeScript Errors:**
   - Run `npx tsc --noEmit` locally
   - Fix any type errors

### Coverage Not Uploading

1. **Codecov Token:**
   - Optional - workflows will run without it
   - Set `CODECOV_TOKEN` secret if you want uploads

2. **Coverage Report:**
   - Check `coverage/` directory is generated
   - Verify `lcov.info` file exists

## Customization

### Adding New Workflows

1. Create a new `.yml` file in `.github/workflows/`
2. Follow the pattern from existing workflows
3. Test locally with [act](https://github.com/nektos/act) if possible

### Modifying Workflows

1. Edit the workflow file
2. Commit and push
3. Workflows will use the new configuration on next run

### Environment Variables

Add secrets in: Repository → Settings → Secrets and variables → Actions

Common secrets you might need:
- `CODECOV_TOKEN` - For coverage reporting
- `MONDAY_API_KEY` - If testing integrations
- `DB_*` - If using external test database

## Best Practices

1. **Keep workflows fast** - Use caching and parallel jobs
2. **Fail fast** - Don't continue on critical errors
3. **Use secrets** - Never commit sensitive data
4. **Test locally** - Use `act` or run tests manually
5. **Monitor regularly** - Check Actions tab for failures

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Documentation](.github/workflows/README.md)
- [Testing Guide](../TESTING.md)
- [Development Guide](../DEVELOPMENT.md)

## Next Steps

1. ✅ Update Dependabot username
2. ✅ Update status badge URLs
3. ✅ (Optional) Set up Codecov
4. ✅ Test workflows with a PR
5. ✅ Monitor workflow runs
6. ✅ Customize as needed

Your CI/CD pipeline is now set up! 🚀
