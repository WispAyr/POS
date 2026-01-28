#!/usr/bin/env ts-node
/**
 * Claude PR Review Agent
 *
 * Automatically reviews pull requests using Claude AI.
 * Can be run as a cron job or triggered by GitHub webhooks.
 *
 * Usage:
 *   npx ts-node scripts/pr-review-agent.ts [--pr <number>] [--auto-merge] [--dry-run]
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Required for Claude API access
 *   GITHUB_TOKEN - Required for GitHub API access (or use gh auth)
 *
 * Requirements:
 *   - gh CLI installed and authenticated
 *   - Node.js with ts-node
 */

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const CONFIG = {
  // Auto-approve if all checks pass and changes are low-risk
  autoApprove: process.argv.includes('--auto-approve'),
  // Auto-merge after approval (requires autoApprove)
  autoMerge: process.argv.includes('--auto-merge'),
  // Don't actually post reviews, just log what would happen
  dryRun: process.argv.includes('--dry-run'),
  // Specific PR number to review (optional)
  prNumber: getPRNumberArg(),
  // Max files to analyze in detail
  maxFilesToAnalyze: 50,
  // Max lines per file to include in prompt
  maxLinesPerFile: 500,
};

interface PRData {
  number: number;
  title: string;
  body: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
}

interface PRFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface ReviewResult {
  decision: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  summary: string;
  issues: Array<{
    file: string;
    line?: number;
    severity: 'error' | 'warning' | 'suggestion';
    message: string;
  }>;
  suggestions: string[];
}

function getPRNumberArg(): number | undefined {
  const idx = process.argv.indexOf('--pr');
  if (idx !== -1 && process.argv[idx + 1]) {
    return parseInt(process.argv[idx + 1], 10);
  }
  return undefined;
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error: any) {
    console.error(`Command failed: ${cmd}`);
    console.error(error.stderr || error.message);
    return '';
  }
}

function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const prefix = {
    info: '\x1b[36mℹ\x1b[0m',
    success: '\x1b[32m✓\x1b[0m',
    warning: '\x1b[33m⚠\x1b[0m',
    error: '\x1b[31m✗\x1b[0m',
  };
  console.log(`${prefix[type]} ${message}`);
}

async function getOpenPRs(): Promise<PRData[]> {
  log('Fetching open pull requests...');

  const output = exec(`gh pr list --json number,title,body,author,baseRefName,headRefName,state,isDraft,mergeable,additions,deletions,changedFiles,url`);

  if (!output) {
    log('No open PRs found or failed to fetch', 'warning');
    return [];
  }

  try {
    const prs = JSON.parse(output);
    return prs.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      author: pr.author?.login || 'unknown',
      baseBranch: pr.baseRefName,
      headBranch: pr.headRefName,
      state: pr.state,
      isDraft: pr.isDraft,
      mergeable: pr.mergeable,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      url: pr.url,
    }));
  } catch (e) {
    log('Failed to parse PR list', 'error');
    return [];
  }
}

async function getPRDetails(prNumber: number): Promise<{ pr: PRData; files: PRFile[]; diff: string }> {
  log(`Fetching details for PR #${prNumber}...`);

  // Get PR data
  const prOutput = exec(`gh pr view ${prNumber} --json number,title,body,author,baseRefName,headRefName,state,isDraft,mergeable,additions,deletions,changedFiles,url`);
  const pr = JSON.parse(prOutput);

  // Get changed files
  const filesOutput = exec(`gh pr diff ${prNumber} --name-status`);
  const files: PRFile[] = filesOutput.split('\n').filter(Boolean).map(line => {
    const [status, ...pathParts] = line.split('\t');
    return {
      path: pathParts.join('\t'),
      status: status === 'A' ? 'added' : status === 'D' ? 'deleted' : status === 'M' ? 'modified' : 'renamed',
      additions: 0,
      deletions: 0,
    };
  });

  // Get full diff
  const diff = exec(`gh pr diff ${prNumber}`);

  return {
    pr: {
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      author: pr.author?.login || 'unknown',
      baseBranch: pr.baseRefName,
      headBranch: pr.headRefName,
      state: pr.state,
      isDraft: pr.isDraft,
      mergeable: pr.mergeable,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      url: pr.url,
    },
    files,
    diff,
  };
}

async function runTests(): Promise<{ passed: boolean; output: string }> {
  log('Running tests...');

  try {
    const output = execSync('npm test 2>&1', { encoding: 'utf-8', timeout: 300000 });
    return { passed: true, output };
  } catch (error: any) {
    return { passed: false, output: error.stdout || error.message };
  }
}

async function runLint(): Promise<{ passed: boolean; output: string }> {
  log('Running linter...');

  try {
    const output = execSync('npm run lint 2>&1', { encoding: 'utf-8', timeout: 60000 });
    const hasErrors = output.includes(' error ');
    return { passed: !hasErrors, output };
  } catch (error: any) {
    return { passed: false, output: error.stdout || error.message };
  }
}

async function runBuild(): Promise<{ passed: boolean; output: string }> {
  log('Running build...');

  try {
    const output = execSync('npm run build:no-audit 2>&1', { encoding: 'utf-8', timeout: 120000 });
    return { passed: true, output };
  } catch (error: any) {
    return { passed: false, output: error.stdout || error.message };
  }
}

async function analyzeWithClaude(pr: PRData, files: PRFile[], diff: string, testResults: any): Promise<ReviewResult> {
  log('Analyzing changes with Claude...');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log('ANTHROPIC_API_KEY not set, using basic analysis', 'warning');
    return basicAnalysis(pr, files, testResults);
  }

  // Truncate diff if too long
  const maxDiffLength = 50000;
  const truncatedDiff = diff.length > maxDiffLength
    ? diff.substring(0, maxDiffLength) + '\n\n... [diff truncated] ...'
    : diff;

  const prompt = `You are a code review assistant. Analyze this pull request and provide a review.

## PR Information
- **Title**: ${pr.title}
- **Author**: ${pr.author}
- **Branch**: ${pr.headBranch} → ${pr.baseBranch}
- **Changes**: +${pr.additions} -${pr.deletions} across ${pr.changedFiles} files

## PR Description
${pr.body || 'No description provided.'}

## Changed Files
${files.map(f => `- ${f.status}: ${f.path}`).join('\n')}

## Test Results
- Tests: ${testResults.tests.passed ? 'PASSED' : 'FAILED'}
- Lint: ${testResults.lint.passed ? 'PASSED' : 'FAILED'}
- Build: ${testResults.build.passed ? 'PASSED' : 'FAILED'}

## Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

## Instructions
Analyze the code changes and respond with a JSON object:
{
  "decision": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "summary": "Brief summary of the changes and overall assessment",
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "error" | "warning" | "suggestion",
      "message": "Description of the issue"
    }
  ],
  "suggestions": ["List of improvement suggestions"]
}

Guidelines:
- APPROVE if: tests pass, no critical issues, code follows best practices
- REQUEST_CHANGES if: tests fail, security issues, breaking changes without migration
- COMMENT if: minor suggestions, questions about implementation

Focus on:
1. Security vulnerabilities (SQL injection, XSS, etc.)
2. Performance issues
3. Error handling
4. Code style consistency
5. Test coverage for new code
6. Breaking API changes`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No JSON found in response');
  } catch (error) {
    log(`Claude analysis failed: ${error}`, 'error');
    return basicAnalysis(pr, files, testResults);
  }
}

function basicAnalysis(pr: PRData, files: PRFile[], testResults: any): ReviewResult {
  const issues: ReviewResult['issues'] = [];
  const suggestions: string[] = [];

  // Check test results
  if (!testResults.tests.passed) {
    issues.push({
      file: '',
      severity: 'error',
      message: 'Tests are failing. Please fix before merging.',
    });
  }

  if (!testResults.lint.passed) {
    issues.push({
      file: '',
      severity: 'warning',
      message: 'Linting errors detected. Run `npm run lint` to fix.',
    });
  }

  if (!testResults.build.passed) {
    issues.push({
      file: '',
      severity: 'error',
      message: 'Build is failing. Please fix compilation errors.',
    });
  }

  // Check for suspicious patterns
  const sensitiveFiles = files.filter(f =>
    f.path.includes('.env') ||
    f.path.includes('secret') ||
    f.path.includes('credential')
  );

  if (sensitiveFiles.length > 0) {
    issues.push({
      file: sensitiveFiles[0].path,
      severity: 'error',
      message: 'Sensitive files detected in changes. Please review carefully.',
    });
  }

  // Determine decision
  let decision: ReviewResult['decision'] = 'APPROVE';
  if (issues.some(i => i.severity === 'error')) {
    decision = 'REQUEST_CHANGES';
  } else if (issues.length > 0) {
    decision = 'COMMENT';
  }

  return {
    decision,
    summary: `Automated review of ${pr.changedFiles} files (+${pr.additions}/-${pr.deletions})`,
    issues,
    suggestions,
  };
}

async function postReview(prNumber: number, review: ReviewResult): Promise<void> {
  if (CONFIG.dryRun) {
    log('DRY RUN - Would post review:', 'info');
    console.log(JSON.stringify(review, null, 2));
    return;
  }

  log(`Posting ${review.decision} review to PR #${prNumber}...`);

  // Build review body
  let body = `## 🤖 Automated Code Review\n\n`;
  body += `### Summary\n${review.summary}\n\n`;

  if (review.issues.length > 0) {
    body += `### Issues Found\n`;
    for (const issue of review.issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : '💡';
      const location = issue.file ? `\`${issue.file}${issue.line ? `:${issue.line}` : ''}\`: ` : '';
      body += `- ${icon} ${location}${issue.message}\n`;
    }
    body += '\n';
  }

  if (review.suggestions.length > 0) {
    body += `### Suggestions\n`;
    for (const suggestion of review.suggestions) {
      body += `- 💡 ${suggestion}\n`;
    }
    body += '\n';
  }

  body += `\n---\n*This review was generated automatically by the PR Review Agent.*`;

  // Post the review
  const eventMap = {
    'APPROVE': 'APPROVE',
    'REQUEST_CHANGES': 'REQUEST_CHANGES',
    'COMMENT': 'COMMENT',
  };

  const cmd = `gh pr review ${prNumber} --${review.decision.toLowerCase().replace('_', '-')} --body "${body.replace(/"/g, '\\"')}"`;

  try {
    exec(cmd);
    log(`Posted ${review.decision} review`, 'success');
  } catch (error) {
    log(`Failed to post review: ${error}`, 'error');
  }
}

async function mergePR(prNumber: number): Promise<void> {
  if (CONFIG.dryRun) {
    log('DRY RUN - Would merge PR', 'info');
    return;
  }

  log(`Merging PR #${prNumber}...`);

  try {
    exec(`gh pr merge ${prNumber} --squash --auto`);
    log('PR merged successfully', 'success');
  } catch (error) {
    log(`Failed to merge PR: ${error}`, 'error');
  }
}

async function reviewPR(prNumber: number): Promise<void> {
  log(`\n${'='.repeat(60)}`);
  log(`Reviewing PR #${prNumber}`);
  log('='.repeat(60));

  try {
    // Get PR details
    const { pr, files, diff } = await getPRDetails(prNumber);

    if (pr.isDraft) {
      log('Skipping draft PR', 'warning');
      return;
    }

    log(`Title: ${pr.title}`);
    log(`Author: ${pr.author}`);
    log(`Changes: +${pr.additions} -${pr.deletions} (${pr.changedFiles} files)`);

    // Checkout the PR branch
    log('Checking out PR branch...');
    exec(`gh pr checkout ${prNumber}`);

    // Run tests
    const testResults = {
      tests: await runTests(),
      lint: await runLint(),
      build: await runBuild(),
    };

    log(`Tests: ${testResults.tests.passed ? 'PASSED' : 'FAILED'}`, testResults.tests.passed ? 'success' : 'error');
    log(`Lint: ${testResults.lint.passed ? 'PASSED' : 'FAILED'}`, testResults.lint.passed ? 'success' : 'error');
    log(`Build: ${testResults.build.passed ? 'PASSED' : 'FAILED'}`, testResults.build.passed ? 'success' : 'error');

    // Analyze with Claude
    const review = await analyzeWithClaude(pr, files, diff, testResults);

    log(`Review decision: ${review.decision}`, review.decision === 'APPROVE' ? 'success' : 'warning');

    // Post review
    await postReview(prNumber, review);

    // Auto-merge if configured and approved
    if (CONFIG.autoMerge && review.decision === 'APPROVE') {
      await mergePR(prNumber);
    }

    // Return to original branch
    exec('git checkout -');

  } catch (error) {
    log(`Error reviewing PR #${prNumber}: ${error}`, 'error');
    // Try to return to original branch
    exec('git checkout - 2>/dev/null || true');
  }
}

async function main() {
  log('🤖 Claude PR Review Agent', 'info');
  log(`Mode: ${CONFIG.dryRun ? 'DRY RUN' : 'LIVE'}`);

  if (CONFIG.prNumber) {
    // Review specific PR
    await reviewPR(CONFIG.prNumber);
  } else {
    // Review all open PRs
    const prs = await getOpenPRs();

    if (prs.length === 0) {
      log('No open PRs to review', 'info');
      return;
    }

    log(`Found ${prs.length} open PR(s)`, 'info');

    for (const pr of prs) {
      await reviewPR(pr.number);
    }
  }

  log('\n✨ Done!', 'success');
}

main().catch(console.error);
