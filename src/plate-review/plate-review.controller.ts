import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { PlateReviewService, ReviewFilters } from './services/plate-review.service';
import { PlateValidationService } from './services/plate-validation.service';
import { ReviewStatus, ValidationStatus } from '../domain/entities/plate-review.entity';

// DTOs
class ApproveReviewDto {
  userId: string;
  notes?: string;
}

class CorrectReviewDto {
  userId: string;
  correctedVrm: string;
  notes?: string;
}

class DiscardReviewDto {
  userId: string;
  reason: string;
}

class BulkApproveDto {
  userId: string;
  reviewIds: string[];
}

class BulkDiscardDto {
  userId: string;
  reviewIds: string[];
  reason: string;
}

class BulkDiscardByReasonDto {
  userId: string;
  suspicionReason: string; // e.g., 'HAILO_NO_VEHICLE', 'UNKNOWN_PLATE'
  discardReason: string;
  siteId?: string;
  limit?: number;
}

@Controller('plate-review')
export class PlateReviewController {
  constructor(
    private readonly plateReviewService: PlateReviewService,
    private readonly plateValidationService: PlateValidationService,
  ) {}

  /**
   * GET /plate-review/queue
   * Gets the review queue with optional filters
   */
  @Get('queue')
  async getReviewQueue(
    @Query('siteId') siteId?: string,
    @Query('validationStatus') validationStatus?: ValidationStatus,
    @Query('reviewStatus') reviewStatus?: ReviewStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters: ReviewFilters = {
      siteId,
      validationStatus,
      reviewStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    return this.plateReviewService.getReviewQueue(filters);
  }

  /**
   * GET /plate-review/:id
   * Gets a single review entry by ID
   */
  @Get(':id')
  async getReviewById(@Param('id') id: string) {
    return this.plateReviewService.getReviewById(id);
  }

  /**
   * POST /plate-review/:id/approve
   * Approves a plate review
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approvePlate(@Param('id') id: string, @Body() dto: ApproveReviewDto) {
    return this.plateReviewService.approvePlate(id, dto.userId, dto.notes);
  }

  /**
   * POST /plate-review/:id/correct
   * Corrects a plate with a new VRM
   */
  @Post(':id/correct')
  @HttpCode(HttpStatus.OK)
  async correctPlate(@Param('id') id: string, @Body() dto: CorrectReviewDto) {
    return this.plateReviewService.correctPlate(id, dto.correctedVrm, dto.userId, dto.notes);
  }

  /**
   * POST /plate-review/:id/discard
   * Discards a plate review
   */
  @Post(':id/discard')
  @HttpCode(HttpStatus.OK)
  async discardPlate(@Param('id') id: string, @Body() dto: DiscardReviewDto) {
    return this.plateReviewService.discardPlate(id, dto.userId, dto.reason);
  }

  /**
   * POST /plate-review/bulk-approve
   * Bulk approves multiple reviews
   */
  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  async bulkApprove(@Body() dto: BulkApproveDto) {
    return this.plateReviewService.bulkApprove(dto.reviewIds, dto.userId);
  }

  /**
   * POST /plate-review/bulk-discard
   * Bulk discards multiple reviews
   */
  @Post('bulk-discard')
  @HttpCode(HttpStatus.OK)
  async bulkDiscard(@Body() dto: BulkDiscardDto) {
    return this.plateReviewService.bulkDiscard(dto.reviewIds, dto.userId, dto.reason);
  }

  /**
   * POST /plate-review/bulk-discard-by-reason
   * Bulk discards reviews matching a specific suspicion reason
   * Useful for clearing out HAILO_NO_VEHICLE, UNKNOWN_PLATE, etc.
   */
  @Post('bulk-discard-by-reason')
  @HttpCode(HttpStatus.OK)
  async bulkDiscardByReason(@Body() dto: BulkDiscardByReasonDto) {
    return this.plateReviewService.bulkDiscardByReason(
      dto.suspicionReason,
      dto.userId,
      dto.discardReason,
      dto.siteId,
      dto.limit || 100,
    );
  }

  /**
   * GET /plate-review/suspicion-reasons
   * Gets a summary of pending reviews grouped by suspicion reason
   */
  @Get('stats/by-reason')
  async getByReasonStats(@Query('siteId') siteId?: string) {
    return this.plateReviewService.getReviewsByReasonStats(siteId);
  }

  /**
   * GET /plate-review/:id/suggestions
   * Gets suggested corrections for a review entry
   */
  @Get(':id/suggestions')
  async getSuggestedCorrections(@Param('id') id: string) {
    return this.plateReviewService.getSuggestedCorrections(id);
  }

  /**
   * GET /plate-review/statistics
   * Gets review queue statistics
   */
  @Get('stats/summary')
  async getStatistics(@Query('siteId') siteId?: string) {
    return this.plateReviewService.getReviewStatistics(siteId);
  }

  /**
   * POST /plate-review/validate
   * Validates a VRM (utility endpoint for testing)
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validatePlate(@Body() body: { vrm: string }) {
    return this.plateValidationService.validatePlate(body.vrm);
  }

  /**
   * POST /plate-review/detect-suspicious
   * Detects if a VRM is suspicious (utility endpoint for testing)
   */
  @Post('detect-suspicious')
  @HttpCode(HttpStatus.OK)
  async detectSuspicious(@Body() body: { vrm: string; confidence?: number }) {
    return this.plateValidationService.detectSuspiciousPlate(body.vrm, body.confidence);
  }

  /**
   * POST /plate-review/suggest-corrections
   * Suggests corrections for a VRM (utility endpoint for testing)
   */
  @Post('suggest-corrections')
  @HttpCode(HttpStatus.OK)
  async suggestCorrections(@Body() body: { vrm: string }) {
    return this.plateValidationService.suggestCorrections(body.vrm);
  }
}
