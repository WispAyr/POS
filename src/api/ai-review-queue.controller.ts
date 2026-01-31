import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../domain/entities';
import { AuditService } from '../audit/audit.service';
import axios from 'axios';

// In-memory queue for review requests (could be Redis/DB in production)
interface ReviewRequest {
  id: string;
  context: 'system' | 'enforcement' | 'vrm' | 'filo';
  entityId?: string;
  vrm?: string;
  siteId?: string;
  minHours?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  requestedBy: string;
  response?: {
    summary: string;
    details?: string;
    recommendations?: string;
    severity?: string;
    completedAt: Date;
  };
  error?: string;
}

const reviewQueue = new Map<string, ReviewRequest>();

// Clawdbot gateway URL (configurable)
const CLAWDBOT_GATEWAY = process.env.CLAWDBOT_GATEWAY_URL || 'http://localhost:3033';
const CLAWDBOT_TOKEN = process.env.CLAWDBOT_GATEWAY_TOKEN || '';

@Controller('api/ai-review-queue')
export class AiReviewQueueController {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Request an AI review - queues the request and notifies Skynet
   */
  @Post('request')
  async requestReview(
    @Body() body: {
      context: 'system' | 'enforcement' | 'vrm' | 'filo';
      entityId?: string;
      vrm?: string;
      siteId?: string;
      minHours?: number;
      requestedBy?: string;
    },
  ) {
    const id = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const request: ReviewRequest = {
      id,
      context: body.context,
      entityId: body.entityId,
      vrm: body.vrm,
      siteId: body.siteId,
      minHours: body.minHours,
      status: 'pending',
      requestedAt: new Date(),
      requestedBy: body.requestedBy || 'operator',
    };
    
    reviewQueue.set(id, request);

    // Log the request to audit trail
    await this.auditService.log({
      entityType: 'AI_REVIEW_REQUEST',
      entityId: id,
      action: 'AI_REVIEW_REQUESTED',
      actor: body.requestedBy || 'OPERATOR',
      siteId: body.siteId,
      vrm: body.vrm,
      details: {
        context: body.context,
        entityId: body.entityId,
      },
    });

    // Try to notify Clawdbot/Skynet via cron wake or direct message
    try {
      await this.notifySkynet(request);
    } catch (err) {
      console.error('Failed to notify Skynet:', err);
      // Don't fail the request - Skynet can pick it up via polling
    }

    return {
      success: true,
      requestId: id,
      status: 'pending',
      message: 'AI review requested. Skynet will analyze and respond.',
    };
  }

  /**
   * Get status of a review request
   */
  @Get('status/:id')
  async getRequestStatus(@Param('id') id: string) {
    const request = reviewQueue.get(id);
    if (!request) {
      throw new NotFoundException('Review request not found');
    }
    return request;
  }

  /**
   * List pending review requests (for Skynet to poll)
   */
  @Get('pending')
  async getPendingRequests() {
    const pending: ReviewRequest[] = [];
    reviewQueue.forEach((request) => {
      if (request.status === 'pending') {
        pending.push(request);
      }
    });
    return pending.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  }

  /**
   * Mark a request as processing (Skynet calls this when starting review)
   */
  @Post('processing/:id')
  async markProcessing(@Param('id') id: string) {
    const request = reviewQueue.get(id);
    if (!request) {
      throw new NotFoundException('Review request not found');
    }
    request.status = 'processing';
    return { success: true, status: 'processing' };
  }

  /**
   * Complete a review request with AI response (Skynet calls this)
   */
  @Post('complete/:id')
  async completeReview(
    @Param('id') id: string,
    @Body() body: {
      summary: string;
      details?: string;
      recommendations?: string;
      severity?: string;
    },
  ) {
    const request = reviewQueue.get(id);
    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    request.status = 'completed';
    request.response = {
      summary: body.summary,
      details: body.details,
      recommendations: body.recommendations,
      severity: body.severity || 'INFO',
      completedAt: new Date(),
    };

    // Log the completed review to audit trail
    await this.auditService.log({
      entityType: 'AI_REVIEW_REQUEST',
      entityId: id,
      action: 'AI_REVIEW_COMPLETED',
      actor: 'AI_ASSISTANT',
      actorType: 'AI',
      siteId: request.siteId,
      vrm: request.vrm,
      details: {
        context: request.context,
        entityId: request.entityId,
        summary: body.summary,
        severity: body.severity,
        recommendations: body.recommendations,
      },
    });

    return { success: true, status: 'completed' };
  }

  /**
   * Fail a review request
   */
  @Post('fail/:id')
  async failReview(
    @Param('id') id: string,
    @Body() body: { error: string },
  ) {
    const request = reviewQueue.get(id);
    if (!request) {
      throw new NotFoundException('Review request not found');
    }

    request.status = 'failed';
    request.error = body.error;

    return { success: true, status: 'failed' };
  }

  /**
   * Get recent completed reviews
   */
  @Get('recent')
  async getRecentReviews(@Query('limit') limit?: string) {
    const completed: ReviewRequest[] = [];
    reviewQueue.forEach((request) => {
      if (request.status === 'completed' && request.response) {
        completed.push(request);
      }
    });
    
    return completed
      .sort((a, b) => (b.response?.completedAt.getTime() || 0) - (a.response?.completedAt.getTime() || 0))
      .slice(0, parseInt(limit || '10', 10));
  }

  /**
   * Notify Skynet about a pending review
   */
  private async notifySkynet(request: ReviewRequest) {
    // Build a message for Skynet
    let message = `🤖 AI Review Requested (ID: ${request.id})\n`;
    message += `Context: ${request.context}\n`;
    if (request.vrm) message += `VRM: ${request.vrm}\n`;
    if (request.siteId) message += `Site: ${request.siteId}\n`;
    if (request.entityId) message += `Entity: ${request.entityId}\n`;
    message += `\nPlease review using the POS MCP tools and complete the review.`;

    // Try to wake Clawdbot via cron wake endpoint
    try {
      await axios.post(
        `${CLAWDBOT_GATEWAY}/api/cron/wake`,
        { text: message, mode: 'now' },
        {
          headers: {
            'Authorization': `Bearer ${CLAWDBOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        },
      );
    } catch (err) {
      // Fallback: The review will be picked up via heartbeat or manual check
      console.log('Clawdbot wake failed, review will be picked up via polling');
    }
  }
}
