# Plate Review System

## Overview

The Plate Review System provides a comprehensive solution for handling unknown, corrupted, or suspicious license plates detected by ANPR cameras. It ensures that only validated plates are processed through the parking events generator, maintaining data quality and accuracy.

## Features

### 1. Automatic Plate Validation
- **UK Format Validation**: Supports multiple UK plate formats (Standard 2001+, Prefix, Suffix, Dateless)
- **International Format Support**: Generic validation for international plates
- **Configurable Rules**: Database-driven validation patterns with priority ordering
- **OCR Error Detection**: Identifies common OCR misreads (0/O, 1/I, 5/S, etc.)

### 2. Suspicion Detection
The system automatically flags plates for review based on multiple criteria:
- Low confidence scores (< 0.8)
- Special characters (non-alphanumeric)
- Repeated characters (e.g., "AAAAA")
- All zeros
- Invalid length (< 2 or > 10 characters)
- Suspicious patterns (e.g., "III111", "OOO000")
- Invalid format (doesn't match any known pattern)
- Non-UK format (could be international or misread)

### 3. Human Review Queue
- **Pending Queue**: All suspicious plates awaiting review
- **Filtering**: By site, validation status, review status, date range
- **Statistics Dashboard**: Real-time counts of pending, approved, corrected, and discarded plates
- **Bulk Actions**: Approve or discard multiple plates at once
- **Visual Review**: Display of plate images for manual verification

### 4. Review Actions

#### Approve
- Confirms the plate reading is correct
- Removes review flag from movement
- Triggers session processing automatically
- Logs action in audit trail

#### Correct
- Allows operator to enter corrected VRM
- Provides AI-powered suggestions based on OCR error patterns
- Validates corrected VRM
- Updates movement record with correct VRM
- Triggers session processing with corrected data
- Logs correction in audit trail

#### Discard
- Marks plate as invalid/corrupted
- Prevents processing through parking events generator
- Requires reason for discarding
- Logs discard action in audit trail

### 5. Audit Logging
All review actions are fully audited:
- `PLATE_REVIEW_CREATED`: When a suspicious plate is flagged
- `PLATE_REVIEW_APPROVED`: When operator approves a plate
- `PLATE_REVIEW_CORRECTED`: When operator corrects a plate (includes old and new VRM)
- `PLATE_REVIEW_DISCARDED`: When operator discards a plate (includes reason)
- `PLATE_REPROCESSED`: When a reviewed plate is reprocessed

## Architecture

### Database Schema

#### plate_reviews
```sql
CREATE TABLE plate_reviews (
  id UUID PRIMARY KEY,
  movement_id UUID NOT NULL,
  original_vrm VARCHAR(20) NOT NULL,
  normalized_vrm VARCHAR(20) NOT NULL,
  site_id VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  confidence DECIMAL(5,2),
  suspicion_reasons TEXT[],
  validation_status VARCHAR(50) NOT NULL,
  review_status VARCHAR(50) DEFAULT 'PENDING',
  corrected_vrm VARCHAR(20),
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  images JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_plate_reviews_status ON plate_reviews(review_status, created_at);
CREATE INDEX idx_plate_reviews_site_status ON plate_reviews(site_id, review_status);
CREATE INDEX idx_plate_reviews_validation ON plate_reviews(validation_status, review_status);
CREATE INDEX idx_plate_reviews_movement ON plate_reviews(movement_id);
CREATE INDEX idx_plate_reviews_vrm ON plate_reviews(normalized_vrm);
```

#### plate_validation_rules
```sql
CREATE TABLE plate_validation_rules (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  pattern TEXT NOT NULL,
  region VARCHAR(50) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### movements (updated)
```sql
ALTER TABLE movements ADD COLUMN requires_review BOOLEAN DEFAULT FALSE;
```

### Services

#### PlateValidationService
```typescript
// Validates plates against patterns
validatePlate(vrm: string): Promise<ValidationResult>

// Detects suspicious plates
detectSuspiciousPlate(vrm: string, confidence?: number): Promise<SuspicionResult>

// Suggests corrections for OCR errors
suggestCorrections(vrm: string): Promise<CorrectionSuggestion[]>

// Seeds default validation rules
seedDefaultRules(): Promise<void>
```

#### PlateReviewService
```typescript
// Creates review entry for suspicious plate
createReviewEntry(dto: CreateReviewEntryDto): Promise<PlateReview>

// Gets review queue with filters
getReviewQueue(filters: ReviewFilters): Promise<ReviewQueueResponse>

// Approves a plate
approvePlate(reviewId: string, userId: string, notes?: string): Promise<PlateReview>

// Corrects a plate with new VRM
correctPlate(reviewId: string, correctedVrm: string, userId: string, notes?: string): Promise<PlateReview>

// Discards a plate
discardPlate(reviewId: string, userId: string, reason: string): Promise<PlateReview>

// Bulk approve multiple reviews
bulkApprove(reviewIds: string[], userId: string): Promise<PlateReview[]>

// Bulk discard multiple reviews
bulkDiscard(reviewIds: string[], userId: string, reason: string): Promise<PlateReview[]>

// Gets suggested corrections
getSuggestedCorrections(reviewId: string): Promise<CorrectionSuggestion[]>

// Gets review statistics
getReviewStatistics(siteId?: string): Promise<ReviewStatistics>
```

## API Endpoints

### Review Queue
```
GET /plate-review/queue
Query Parameters:
  - siteId?: string
  - validationStatus?: ValidationStatus
  - reviewStatus?: ReviewStatus
  - startDate?: string (ISO 8601)
  - endDate?: string (ISO 8601)
  - limit?: number (default: 50)
  - offset?: number (default: 0)

Response: {
  items: PlateReview[],
  total: number,
  limit: number,
  offset: number
}
```

### Get Review
```
GET /plate-review/:id

Response: PlateReview
```

### Approve Plate
```
POST /plate-review/:id/approve
Body: {
  userId: string,
  notes?: string
}

Response: PlateReview
```

### Correct Plate
```
POST /plate-review/:id/correct
Body: {
  userId: string,
  correctedVrm: string,
  notes?: string
}

Response: PlateReview
```

### Discard Plate
```
POST /plate-review/:id/discard
Body: {
  userId: string,
  reason: string
}

Response: PlateReview
```

### Bulk Actions
```
POST /plate-review/bulk-approve
Body: {
  userId: string,
  reviewIds: string[]
}

POST /plate-review/bulk-discard
Body: {
  userId: string,
  reviewIds: string[],
  reason: string
}
```

### Get Suggestions
```
GET /plate-review/:id/suggestions

Response: CorrectionSuggestion[]
```

### Get Statistics
```
GET /plate-review/stats/summary
Query Parameters:
  - siteId?: string

Response: {
  totalPending: number,
  totalApproved: number,
  totalCorrected: number,
  totalDiscarded: number,
  total: number,
  byValidationStatus: {
    ukSuspicious: number,
    internationalSuspicious: number,
    invalid: number
  }
}
```

### Utility Endpoints
```
POST /plate-review/validate
Body: { vrm: string }

POST /plate-review/detect-suspicious
Body: { vrm: string, confidence?: number }

POST /plate-review/suggest-corrections
Body: { vrm: string }
```

## Integration Flow

### 1. ANPR Ingestion
```
ANPR Event → Normalize VRM → Validate Plate → Check Suspicion
                                                      ↓
                                              Is Suspicious?
                                                      ↓
                                            Yes ←──────┴──────→ No
                                             ↓                   ↓
                                  Create Review Entry    Process Session
                                  Set requiresReview=true
                                  Skip Session Processing
```

### 2. Human Review
```
Review Queue → Operator Action
                      ↓
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
    Approve       Correct       Discard
        ↓             ↓             ↓
  Clear Review  Update VRM    Mark Invalid
        ↓             ↓             ↓
Process Session Process Session  No Processing
```

### 3. Session Processing
```
Movement → Check requiresReview flag
                    ↓
              requiresReview?
                    ↓
        Yes ←───────┴────────→ No
         ↓                      ↓
    Skip Processing     Process Normally
    Wait for Review     Create Session
                       Evaluate Rules
```

## UI Components

### PlateReviewQueue Component
- **Location**: `frontend/src/components/PlateReviewQueue.tsx`
- **Features**:
  - Statistics dashboard (pending, approved, corrected, discarded)
  - Filtering (site, validation status, review status)
  - Bulk selection and actions
  - Inline editing for corrections
  - AI-powered correction suggestions
  - Image gallery for visual verification
  - Pagination for large result sets

## Setup and Configuration

### 1. Database Migration
The system uses TypeORM's `synchronize: true` in development, which will automatically create the new tables and columns.

For production, generate and run migrations:
```bash
npm run migration:generate -- -n AddPlateReviewSystem
npm run migration:run
```

### 2. Seed Validation Rules
```bash
npm run ts-node scripts/seed-validation-rules.ts
```

This creates default validation rules for:
- UK Standard (2001+): `^[A-Z]{2}[0-9]{2}[A-Z]{3}$`
- UK Prefix (1983-2001): `^[A-Z][0-9]{1,3}[A-Z]{3}$`
- UK Suffix (1963-1983): `^[A-Z]{3}[0-9]{1,3}[A-Z]?$`
- UK Dateless (Pre-1963): `^[A-Z]{1,3}[0-9]{1,4}$`
- International Generic: `^[A-Z0-9]{2,10}$`

### 3. Environment Variables
No new environment variables required. The system uses existing database connection settings.

## Usage Examples

### Example 1: Suspicious Plate Detected
```
ANPR reads: "0OO123ABC" (confidence: 0.65)
↓
System detects:
- LOW_CONFIDENCE:0.65
- SUSPICIOUS_PATTERN (0OO)
↓
Creates review entry with validation_status: UK_SUSPICIOUS
↓
Operator reviews:
- Sees suggestions: "000123ABC" (O→0), "OOO123ABC" (0→O)
- Corrects to: "OOO123ABC"
↓
System updates movement, triggers session processing
```

### Example 2: Invalid Format
```
ANPR reads: "INVALID!!!" (confidence: 0.45)
↓
System detects:
- LOW_CONFIDENCE:0.45
- SPECIAL_CHARACTERS
- INVALID_FORMAT
↓
Creates review entry with validation_status: INVALID
↓
Operator reviews:
- No valid corrections possible
- Discards with reason: "Corrupted plate reading, no vehicle visible"
↓
Movement marked invalid, no processing
```

### Example 3: Bulk Approval
```
10 plates flagged with NON_UK_FORMAT
↓
Operator reviews all plates, determines they are valid international plates
↓
Selects all 10 plates
↓
Clicks "Bulk Approve"
↓
All 10 plates processed through session service
```

## Monitoring and Reporting

### Key Metrics
- **Review Queue Size**: Number of pending reviews
- **Average Review Time**: Time from creation to resolution
- **Correction Rate**: Percentage of plates that needed correction
- **Discard Rate**: Percentage of plates discarded
- **Top Suspicion Reasons**: Most common reasons for flagging

### Audit Trail Queries
```sql
-- Get all reviews for a VRM
SELECT * FROM audit_logs
WHERE vrm = 'AB12CDE'
AND entity_type = 'PLATE_REVIEW'
ORDER BY timestamp DESC;

-- Get correction statistics
SELECT
  DATE(reviewed_at) as date,
  COUNT(*) as total_reviews,
  SUM(CASE WHEN review_status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
  SUM(CASE WHEN review_status = 'CORRECTED' THEN 1 ELSE 0 END) as corrected,
  SUM(CASE WHEN review_status = 'DISCARDED' THEN 1 ELSE 0 END) as discarded
FROM plate_reviews
WHERE reviewed_at IS NOT NULL
GROUP BY DATE(reviewed_at)
ORDER BY date DESC;
```

## Best Practices

### For Operators
1. **Review Images**: Always check plate images before making decisions
2. **Use Suggestions**: AI suggestions can help identify OCR errors
3. **Document Corrections**: Add notes explaining why correction was needed
4. **Be Consistent**: Use consistent reasoning for similar cases
5. **Discard Cautiously**: Only discard when genuinely invalid

### For System Administrators
1. **Monitor Queue Size**: Set alerts if pending reviews exceed threshold
2. **Review Statistics**: Regularly check correction and discard rates
3. **Update Rules**: Add new validation patterns as needed
4. **Tune Thresholds**: Adjust confidence thresholds based on camera quality
5. **Train Operators**: Ensure operators understand common OCR errors

## Troubleshooting

### Problem: Too Many False Positives
**Solution**: Adjust suspicion detection thresholds in `PlateValidationService`:
```typescript
// Increase confidence threshold
if (confidence !== undefined && confidence < 0.7) { // was 0.8
  reasons.push(`LOW_CONFIDENCE:${confidence.toFixed(2)}`);
}
```

### Problem: Valid International Plates Flagged
**Solution**: Add specific international validation rules:
```typescript
await validationRuleRepository.save({
  name: 'German Standard',
  pattern: '^[A-Z]{1,3}[A-Z]{1,2}[0-9]{1,4}$',
  region: PlateRegion.EU,
  priority: 5,
  description: 'German format: 1-3 area letters, 1-2 letters, 1-4 numbers',
});
```

### Problem: Review Queue Growing Too Large
**Solutions**:
1. Increase operator capacity
2. Use bulk actions more frequently
3. Improve ANPR camera quality
4. Adjust suspicion detection to reduce false positives

## Future Enhancements

### Planned Features
- [ ] Machine learning model for plate correction
- [ ] Automatic approval for high-confidence corrections
- [ ] Integration with DVLA database for validation
- [ ] Mobile app for on-site review
- [ ] Real-time notifications for urgent reviews
- [ ] Historical pattern analysis for recurring issues
- [ ] Camera-specific confidence tuning

### Potential Improvements
- Template matching for common plate types
- Image quality assessment before OCR
- Multi-operator review for disputed cases
- Automated testing of validation rules
- Performance optimization for large queues

## Support

For issues or questions:
1. Check audit logs for detailed error information
2. Review system logs in CloudWatch/application logs
3. Contact development team with reproduction steps
4. Include relevant VRM and movement IDs in bug reports
