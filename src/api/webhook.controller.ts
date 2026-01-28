import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';

interface GitHubWebhookPayload {
  action: string;
  number?: number;
  pull_request?: {
    number: number;
    title: string;
    state: string;
    draft: boolean;
    user: { login: string };
  };
  repository?: {
    full_name: string;
  };
}

@Controller('api/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly webhookSecret: string;
  private pendingReviews: Set<number> = new Set();

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET') || '';
  }

  @Post('github')
  async handleGitHubWebhook(
    @Body() payload: GitHubWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Body() rawBody: any,
  ) {
    this.logger.log(`Received GitHub webhook: ${event}`);

    // Verify webhook signature if secret is configured
    if (this.webhookSecret) {
      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(rawBody))
        .digest('hex')}`;

      if (signature !== expectedSignature) {
        this.logger.warn('Invalid webhook signature');
        throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
      }
    }

    // Handle pull request events
    if (event === 'pull_request') {
      return this.handlePullRequestEvent(payload);
    }

    // Handle check run events (for re-review after CI completes)
    if (event === 'check_run') {
      return this.handleCheckRunEvent(payload);
    }

    return { received: true, event };
  }

  private async handlePullRequestEvent(payload: GitHubWebhookPayload) {
    const pr = payload.pull_request;

    if (!pr) {
      return { received: true, skipped: true, reason: 'No PR data' };
    }

    // Only review on specific actions
    const reviewableActions = ['opened', 'synchronize', 'ready_for_review'];
    if (!reviewableActions.includes(payload.action)) {
      this.logger.log(`Skipping PR #${pr.number} - action: ${payload.action}`);
      return { received: true, skipped: true, reason: `Action ${payload.action} not reviewable` };
    }

    // Skip draft PRs
    if (pr.draft) {
      this.logger.log(`Skipping PR #${pr.number} - draft`);
      return { received: true, skipped: true, reason: 'Draft PR' };
    }

    // Prevent duplicate reviews
    if (this.pendingReviews.has(pr.number)) {
      this.logger.log(`Skipping PR #${pr.number} - review already pending`);
      return { received: true, skipped: true, reason: 'Review already pending' };
    }

    // Queue the review
    this.pendingReviews.add(pr.number);
    this.logger.log(`Queuing review for PR #${pr.number}: ${pr.title}`);

    // Run the review agent in the background
    this.runReviewAgent(pr.number);

    return {
      received: true,
      queued: true,
      pr: pr.number,
      title: pr.title,
    };
  }

  private async handleCheckRunEvent(payload: any) {
    // Re-review after CI completes
    if (payload.action !== 'completed') {
      return { received: true, skipped: true };
    }

    const prNumbers = payload.check_run?.pull_requests?.map((pr: any) => pr.number) || [];

    for (const prNumber of prNumbers) {
      if (!this.pendingReviews.has(prNumber)) {
        this.logger.log(`Re-reviewing PR #${prNumber} after CI completed`);
        this.pendingReviews.add(prNumber);
        this.runReviewAgent(prNumber);
      }
    }

    return { received: true, prs: prNumbers };
  }

  private runReviewAgent(prNumber: number) {
    const scriptPath = path.join(process.cwd(), 'scripts', 'pr-review-agent.ts');

    // Run in background with ts-node
    const child = spawn('npx', ['ts-node', scriptPath, '--pr', prNumber.toString()], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    child.unref();

    // Remove from pending after timeout (in case agent crashes)
    setTimeout(() => {
      this.pendingReviews.delete(prNumber);
    }, 10 * 60 * 1000); // 10 minute timeout

    child.on('exit', () => {
      this.pendingReviews.delete(prNumber);
      this.logger.log(`Review agent completed for PR #${prNumber}`);
    });
  }

  @Post('trigger-review')
  async triggerManualReview(@Body('pr') prNumber: number) {
    if (!prNumber) {
      throw new HttpException('PR number required', HttpStatus.BAD_REQUEST);
    }

    if (this.pendingReviews.has(prNumber)) {
      return { queued: false, reason: 'Review already pending' };
    }

    this.pendingReviews.add(prNumber);
    this.runReviewAgent(prNumber);

    return { queued: true, pr: prNumber };
  }
}
