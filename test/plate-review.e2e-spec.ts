import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PlateValidationService } from '../src/plate-review/services/plate-validation.service';
import { ValidationStatus } from '../src/domain/entities/plate-review.entity';

describe('Plate Review System (e2e)', () => {
  let app: INestApplication;
  let plateValidationService: PlateValidationService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    plateValidationService = app.get(PlateValidationService);

    // Seed validation rules
    await plateValidationService.seedDefaultRules();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Plate Validation', () => {
    it('should validate a standard UK plate', async () => {
      const response = await request(app.getHttpServer())
        .post('/plate-review/validate')
        .send({ vrm: 'AB12CDE' })
        .expect(200);

      expect(response.body.isValid).toBe(true);
      expect(response.body.validationStatus).toBe(ValidationStatus.UK_VALID);
      expect(response.body.matchedRegion).toBe('UK');
    });

    it('should detect suspicious plate with low confidence', async () => {
      const response = await request(app.getHttpServer())
        .post('/plate-review/detect-suspicious')
        .send({ vrm: 'AB12CDE', confidence: 0.5 })
        .expect(200);

      expect(response.body.isSuspicious).toBe(true);
      expect(response.body.reasons).toContain('LOW_CONFIDENCE:0.50');
    });

    it('should detect suspicious plate with special characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/plate-review/detect-suspicious')
        .send({ vrm: 'AB12-CDE' })
        .expect(200);

      expect(response.body.isSuspicious).toBe(true);
      expect(response.body.reasons).toContain('SPECIAL_CHARACTERS');
    });

    it('should suggest corrections for OCR errors', async () => {
      const response = await request(app.getHttpServer())
        .post('/plate-review/suggest-corrections')
        .send({ vrm: '0O12CDE' }) // 0 and O confused
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.some((s: any) => s.suggestedVrm === 'OO12CDE')).toBe(true);
    });
  });

  describe('ANPR Ingestion with Plate Review', () => {
    it('should create review entry for suspicious plate', async () => {
      const timestamp = new Date().toISOString();

      // Ingest ANPR with suspicious plate
      const ingestResponse = await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send({
          siteId: 'TEST_SITE',
          vrm: '0OO123ABC', // Suspicious pattern
          timestamp,
          confidence: 0.65, // Low confidence
          cameraId: 'CAM01',
          direction: 'ENTRY',
        })
        .expect(201);

      expect(ingestResponse.body.movement).toBeDefined();
      expect(ingestResponse.body.movement.requiresReview).toBe(true);

      // Check review queue
      const queueResponse = await request(app.getHttpServer())
        .get('/plate-review/queue')
        .query({ reviewStatus: 'PENDING' })
        .expect(200);

      expect(queueResponse.body.items).toBeDefined();
      const review = queueResponse.body.items.find(
        (r: any) => r.normalizedVrm === '0OO123ABC',
      );
      expect(review).toBeDefined();
      expect(review.suspicionReasons).toContain('LOW_CONFIDENCE:0.65');
      expect(review.suspicionReasons).toContain('SUSPICIOUS_PATTERN');
    });
  });

  describe('Review Actions', () => {
    let reviewId: string;
    let movementId: string;

    beforeEach(async () => {
      // Create a test review entry by ingesting suspicious plate
      const timestamp = new Date().toISOString();
      const ingestResponse = await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send({
          siteId: 'TEST_SITE',
          vrm: 'TEST123', // Invalid format
          timestamp,
          confidence: 0.7,
          cameraId: 'CAM01',
          direction: 'ENTRY',
        })
        .expect(201);

      movementId = ingestResponse.body.movement.id;

      // Get review ID
      const queueResponse = await request(app.getHttpServer())
        .get('/plate-review/queue')
        .query({ reviewStatus: 'PENDING' })
        .expect(200);

      const review = queueResponse.body.items.find(
        (r: any) => r.movementId === movementId,
      );
      reviewId = review.id;
    });

    it('should approve a plate', async () => {
      const response = await request(app.getHttpServer())
        .post(`/plate-review/${reviewId}/approve`)
        .send({
          userId: 'test-operator',
          notes: 'Plate is correct',
        })
        .expect(200);

      expect(response.body.reviewStatus).toBe('APPROVED');
      expect(response.body.reviewedBy).toBe('test-operator');
      expect(response.body.reviewNotes).toBe('Plate is correct');
    });

    it('should correct a plate', async () => {
      const response = await request(app.getHttpServer())
        .post(`/plate-review/${reviewId}/correct`)
        .send({
          userId: 'test-operator',
          correctedVrm: 'AB12CDE',
          notes: 'Corrected OCR error',
        })
        .expect(200);

      expect(response.body.reviewStatus).toBe('CORRECTED');
      expect(response.body.correctedVrm).toBe('AB12CDE');
      expect(response.body.reviewedBy).toBe('test-operator');
    });

    it('should discard a plate', async () => {
      const response = await request(app.getHttpServer())
        .post(`/plate-review/${reviewId}/discard`)
        .send({
          userId: 'test-operator',
          reason: 'Corrupted image, no plate visible',
        })
        .expect(200);

      expect(response.body.reviewStatus).toBe('DISCARDED');
      expect(response.body.reviewedBy).toBe('test-operator');
      expect(response.body.reviewNotes).toBe('Corrupted image, no plate visible');
    });

    it('should get suggestions for review', async () => {
      const response = await request(app.getHttpServer())
        .get(`/plate-review/${reviewId}/suggestions`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Review Statistics', () => {
    it('should get review statistics', async () => {
      const response = await request(app.getHttpServer())
        .get('/plate-review/stats/summary')
        .expect(200);

      expect(response.body).toHaveProperty('totalPending');
      expect(response.body).toHaveProperty('totalApproved');
      expect(response.body).toHaveProperty('totalCorrected');
      expect(response.body).toHaveProperty('totalDiscarded');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byValidationStatus');
    });
  });

  describe('Bulk Actions', () => {
    let reviewIds: string[] = [];

    beforeEach(async () => {
      // Create multiple test reviews
      const timestamp = new Date().toISOString();

      for (let i = 0; i < 3; i++) {
        const ingestResponse = await request(app.getHttpServer())
          .post('/ingestion/anpr')
          .send({
            siteId: 'TEST_SITE',
            vrm: `BULK${i}`,
            timestamp: new Date(Date.now() + i * 1000).toISOString(),
            confidence: 0.7,
            cameraId: 'CAM01',
            direction: 'ENTRY',
          })
          .expect(201);
      }

      // Get review IDs
      const queueResponse = await request(app.getHttpServer())
        .get('/plate-review/queue')
        .query({ reviewStatus: 'PENDING' })
        .expect(200);

      reviewIds = queueResponse.body.items
        .filter((r: any) => r.normalizedVrm.startsWith('BULK'))
        .map((r: any) => r.id);
    });

    it('should bulk approve multiple reviews', async () => {
      const response = await request(app.getHttpServer())
        .post('/plate-review/bulk-approve')
        .send({
          userId: 'test-operator',
          reviewIds: reviewIds.slice(0, 2),
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body.every((r: any) => r.reviewStatus === 'APPROVED')).toBe(true);
    });

    it('should bulk discard multiple reviews', async () => {
      const response = await request(app.getHttpServer())
        .post('/plate-review/bulk-discard')
        .send({
          userId: 'test-operator',
          reviewIds: reviewIds.slice(0, 2),
          reason: 'Bulk test discard',
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body.every((r: any) => r.reviewStatus === 'DISCARDED')).toBe(true);
    });
  });
});
