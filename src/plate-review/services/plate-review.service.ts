import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PlateReview, ReviewStatus, ValidationStatus } from '../../domain/entities/plate-review.entity';
import { Movement } from '../../domain/entities/movement.entity';
import { PlateValidationService } from './plate-validation.service';
import { AuditService } from '../../audit/audit.service';
import { SessionService } from '../../engine/services/session.service';

export interface CreateReviewEntryDto {
  movement: Movement;
  validationStatus: ValidationStatus;
  suspicionReasons: string[];
  confidence?: number;
}

export interface ReviewFilters {
  siteId?: string;
  validationStatus?: ValidationStatus;
  reviewStatus?: ReviewStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ReviewQueueResponse {
  items: PlateReview[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class PlateReviewService {
  private readonly logger = new Logger(PlateReviewService.name);

  constructor(
    @InjectRepository(PlateReview)
    private readonly plateReviewRepository: Repository<PlateReview>,
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    private readonly plateValidationService: PlateValidationService,
    private readonly auditService: AuditService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Creates a review entry for a suspicious plate
   */
  async createReviewEntry(dto: CreateReviewEntryDto): Promise<PlateReview> {
    const { movement, validationStatus, suspicionReasons, confidence } = dto;

    // Check if review entry already exists for this movement
    const existingReview = await this.plateReviewRepository.findOne({
      where: { movementId: movement.id },
    });

    if (existingReview) {
      this.logger.warn(`Review entry already exists for movement ${movement.id}`);
      return existingReview;
    }

    // Convert images to the format expected by PlateReview (timestamp as string)
    const reviewImages = movement.images?.map(img => ({
      url: img.url,
      type: img.type,
      timestamp: img.timestamp?.toISOString(),
    }));

    const review = this.plateReviewRepository.create({
      movementId: movement.id,
      originalVrm: movement.rawData?.vrm || movement.rawData?.plateNumber || movement.vrm,
      normalizedVrm: movement.vrm,
      siteId: movement.siteId,
      timestamp: movement.timestamp,
      confidence: confidence,
      suspicionReasons,
      validationStatus,
      reviewStatus: ReviewStatus.PENDING,
      images: reviewImages,
      metadata: {
        cameraIds: movement.cameraIds,
        direction: movement.direction,
        rawData: movement.rawData,
      },
    });

    const savedReview = await this.plateReviewRepository.save(review);

    // Audit log
    await this.auditService.log({
      entityType: 'PLATE_REVIEW',
      entityId: savedReview.id,
      action: 'PLATE_REVIEW_CREATED',
      details: {
        movementId: movement.id,
        vrm: movement.vrm,
        validationStatus,
        suspicionReasons,
        confidence,
      },
      actor: 'SYSTEM',
      actorType: 'SYSTEM',
      siteId: movement.siteId,
      vrm: movement.vrm,
      relatedEntities: [
        { entityType: 'MOVEMENT', entityId: movement.id, relationship: 'SOURCE' },
      ],
    });

    this.logger.log(`Created review entry ${savedReview.id} for movement ${movement.id} (VRM: ${movement.vrm})`);

    return savedReview;
  }

  /**
   * Gets the review queue with filters
   */
  async getReviewQueue(filters: ReviewFilters = {}): Promise<ReviewQueueResponse> {
    const {
      siteId,
      validationStatus,
      reviewStatus = ReviewStatus.PENDING,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    const queryBuilder = this.plateReviewRepository.createQueryBuilder('review');

    // Apply filters
    if (siteId) {
      queryBuilder.andWhere('review.siteId = :siteId', { siteId });
    }

    if (validationStatus) {
      queryBuilder.andWhere('review.validationStatus = :validationStatus', { validationStatus });
    }

    if (reviewStatus) {
      queryBuilder.andWhere('review.reviewStatus = :reviewStatus', { reviewStatus });
    }

    if (startDate) {
      queryBuilder.andWhere('review.timestamp >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('review.timestamp <= :endDate', { endDate });
    }

    // Order by timestamp descending (most recent first)
    queryBuilder.orderBy('review.timestamp', 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const items = await queryBuilder.getMany();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Gets a single review entry by ID
   */
  async getReviewById(reviewId: string): Promise<PlateReview> {
    const review = await this.plateReviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException(`Review entry ${reviewId} not found`);
    }

    return review;
  }

  /**
   * Approves a plate (VRM is correct as captured)
   */
  async approvePlate(reviewId: string, userId: string, notes?: string): Promise<PlateReview> {
    const review = await this.getReviewById(reviewId);

    if (review.reviewStatus !== ReviewStatus.PENDING) {
      throw new Error(`Review ${reviewId} is already ${review.reviewStatus}`);
    }

    review.reviewStatus = ReviewStatus.APPROVED;
    review.reviewedBy = userId;
    review.reviewedAt = new Date();
    review.reviewNotes = notes ?? '';

    const updatedReview = await this.plateReviewRepository.save(review);

    // Audit log
    await this.auditService.log({
      entityType: 'PLATE_REVIEW',
      entityId: reviewId,
      action: 'PLATE_REVIEW_APPROVED',
      details: {
        reviewedBy: userId,
        vrm: review.normalizedVrm,
        notes,
      },
      actor: userId,
      actorType: 'USER',
      siteId: review.siteId,
      vrm: review.normalizedVrm,
      relatedEntities: [
        { entityType: 'MOVEMENT', entityId: review.movementId, relationship: 'SOURCE' },
      ],
    });

    // Update movement to not require review
    await this.movementRepository.update(
      { id: review.movementId },
      { requiresReview: false },
    );

    // Trigger session processing
    await this.reprocessMovement(review.movementId);

    this.logger.log(`Approved plate review ${reviewId} by user ${userId}`);

    return updatedReview;
  }

  /**
   * Corrects a plate with a new VRM
   */
  async correctPlate(reviewId: string, correctedVrm: string, userId: string, notes?: string): Promise<PlateReview> {
    const review = await this.getReviewById(reviewId);

    if (review.reviewStatus !== ReviewStatus.PENDING) {
      throw new Error(`Review ${reviewId} is already ${review.reviewStatus}`);
    }

    // Normalize the corrected VRM
    const normalizedCorrectedVrm = correctedVrm.toUpperCase().replace(/\s/g, '');

    // Validate the corrected VRM
    const validationResult = await this.plateValidationService.validatePlate(normalizedCorrectedVrm);

    review.reviewStatus = ReviewStatus.CORRECTED;
    review.correctedVrm = normalizedCorrectedVrm;
    review.reviewedBy = userId;
    review.reviewedAt = new Date();
    review.reviewNotes = notes ?? '';

    const updatedReview = await this.plateReviewRepository.save(review);

    // Audit log
    await this.auditService.log({
      entityType: 'PLATE_REVIEW',
      entityId: reviewId,
      action: 'PLATE_REVIEW_CORRECTED',
      details: {
        reviewedBy: userId,
        originalVrm: review.normalizedVrm,
        correctedVrm: normalizedCorrectedVrm,
        validationResult,
        notes,
      },
      actor: userId,
      actorType: 'USER',
      siteId: review.siteId,
      vrm: normalizedCorrectedVrm,
      relatedEntities: [
        { entityType: 'MOVEMENT', entityId: review.movementId, relationship: 'SOURCE' },
      ],
    });

    // Update the movement with corrected VRM
    await this.movementRepository.update(
      { id: review.movementId },
      {
        vrm: normalizedCorrectedVrm,
        requiresReview: false,
      },
    );

    // Trigger session processing with corrected VRM
    await this.reprocessMovement(review.movementId);

    this.logger.log(`Corrected plate review ${reviewId} from ${review.normalizedVrm} to ${normalizedCorrectedVrm} by user ${userId}`);

    return updatedReview;
  }

  /**
   * Discards a plate (invalid/corrupted, should not be processed)
   */
  async discardPlate(reviewId: string, userId: string, reason: string): Promise<PlateReview> {
    const review = await this.getReviewById(reviewId);

    if (review.reviewStatus !== ReviewStatus.PENDING) {
      throw new Error(`Review ${reviewId} is already ${review.reviewStatus}`);
    }

    review.reviewStatus = ReviewStatus.DISCARDED;
    review.reviewedBy = userId;
    review.reviewedAt = new Date();
    review.reviewNotes = reason;

    const updatedReview = await this.plateReviewRepository.save(review);

    // Audit log
    await this.auditService.log({
      entityType: 'PLATE_REVIEW',
      entityId: reviewId,
      action: 'PLATE_REVIEW_DISCARDED',
      details: {
        reviewedBy: userId,
        vrm: review.normalizedVrm,
        reason,
      },
      actor: userId,
      actorType: 'USER',
      siteId: review.siteId,
      vrm: review.normalizedVrm,
      relatedEntities: [
        { entityType: 'MOVEMENT', entityId: review.movementId, relationship: 'SOURCE' },
      ],
    });

    // Movement remains with requiresReview=true and won't be processed
    // Optionally, we could mark it as invalid or delete it

    this.logger.log(`Discarded plate review ${reviewId} by user ${userId}: ${reason}`);

    return updatedReview;
  }

  /**
   * Bulk approve multiple reviews
   */
  async bulkApprove(reviewIds: string[], userId: string): Promise<PlateReview[]> {
    const results: PlateReview[] = [];

    for (const reviewId of reviewIds) {
      try {
        const result = await this.approvePlate(reviewId, userId);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to approve review ${reviewId}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Bulk discard multiple reviews
   */
  async bulkDiscard(reviewIds: string[], userId: string, reason: string): Promise<PlateReview[]> {
    const results: PlateReview[] = [];

    for (const reviewId of reviewIds) {
      try {
        const result = await this.discardPlate(reviewId, userId, reason);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to discard review ${reviewId}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Gets suggested corrections for a review entry
   */
  async getSuggestedCorrections(reviewId: string) {
    const review = await this.getReviewById(reviewId);
    return this.plateValidationService.suggestCorrections(review.normalizedVrm);
  }

  /**
   * Gets statistics for the review queue
   */
  async getReviewStatistics(siteId?: string) {
    const queryBuilder = this.plateReviewRepository.createQueryBuilder('review');

    if (siteId) {
      queryBuilder.where('review.siteId = :siteId', { siteId });
    }

    const [
      totalPending,
      totalApproved,
      totalCorrected,
      totalDiscarded,
      ukSuspicious,
      internationalSuspicious,
      invalid,
    ] = await Promise.all([
      queryBuilder.clone().where('review.reviewStatus = :status', { status: ReviewStatus.PENDING }).getCount(),
      queryBuilder.clone().where('review.reviewStatus = :status', { status: ReviewStatus.APPROVED }).getCount(),
      queryBuilder.clone().where('review.reviewStatus = :status', { status: ReviewStatus.CORRECTED }).getCount(),
      queryBuilder.clone().where('review.reviewStatus = :status', { status: ReviewStatus.DISCARDED }).getCount(),
      queryBuilder.clone().where('review.validationStatus = :status', { status: ValidationStatus.UK_SUSPICIOUS }).getCount(),
      queryBuilder.clone().where('review.validationStatus = :status', { status: ValidationStatus.INTERNATIONAL_SUSPICIOUS }).getCount(),
      queryBuilder.clone().where('review.validationStatus = :status', { status: ValidationStatus.INVALID }).getCount(),
    ]);

    return {
      totalPending,
      totalApproved,
      totalCorrected,
      totalDiscarded,
      total: totalPending + totalApproved + totalCorrected + totalDiscarded,
      byValidationStatus: {
        ukSuspicious,
        internationalSuspicious,
        invalid,
      },
    };
  }

  /**
   * Reprocesses a movement through session service
   */
  private async reprocessMovement(movementId: string): Promise<void> {
    try {
      const movement = await this.movementRepository.findOne({
        where: { id: movementId },
      });

      if (!movement) {
        this.logger.error(`Movement ${movementId} not found for reprocessing`);
        return;
      }

      // Trigger session processing
      await this.sessionService.processMovement(movement);

      // Audit log
      await this.auditService.log({
        entityType: 'MOVEMENT',
        entityId: movementId,
        action: 'PLATE_REPROCESSED',
        details: {
          vrm: movement.vrm,
          siteId: movement.siteId,
          reason: 'Plate review completed',
        },
        actor: 'SYSTEM',
        actorType: 'SYSTEM',
        siteId: movement.siteId,
        vrm: movement.vrm,
      });

      this.logger.log(`Reprocessed movement ${movementId} after plate review`);
    } catch (error) {
      this.logger.error(`Failed to reprocess movement ${movementId}: ${error.message}`);
      throw error;
    }
  }
}
