# Plate Review System Implementation

## Summary

A comprehensive human review system has been implemented to handle unknown, corrupted, or suspicious license plates detected by ANPR cameras. The system ensures data quality by preventing suspicious plates from being processed through the parking events generator until they have been manually reviewed and validated.

## What Was Implemented

### 1. Database Schema ✅
- **plate_reviews** table: Stores all plates requiring human review
- **plate_validation_rules** table: Configurable validation patterns for different regions
- **movements** table: Added `requiresReview` boolean flag

### 2. Backend Services ✅

#### PlateValidationService
- Validates VRMs against UK and international patterns
- Detects suspicious plates based on multiple criteria
- Suggests corrections for common OCR errors (0/O, 1/I, 5/S, etc.)
- Configurable validation rules stored in database

#### PlateReviewService
- Creates review entries for suspicious plates
- Manages review queue with comprehensive filtering
- Handles approve, correct, and discard actions
- Supports bulk operations for efficiency
- Provides AI-powered correction suggestions
- Generates real-time statistics

### 3. API Endpoints ✅
- `GET /plate-review/queue` - Get review queue with filters
- `GET /plate-review/:id` - Get single review entry
- `POST /plate-review/:id/approve` - Approve a plate
- `POST /plate-review/:id/correct` - Correct a plate with new VRM
- `POST /plate-review/:id/discard` - Discard an invalid plate
- `POST /plate-review/bulk-approve` - Bulk approve multiple plates
- `POST /plate-review/bulk-discard` - Bulk discard multiple plates
- `GET /plate-review/:id/suggestions` - Get AI correction suggestions
- `GET /plate-review/stats/summary` - Get review statistics
- `POST /plate-review/validate` - Validate a VRM (utility)
- `POST /plate-review/detect-suspicious` - Detect suspicious patterns (utility)
- `POST /plate-review/suggest-corrections` - Get correction suggestions (utility)

### 4. ANPR Integration ✅
- Updated `AnprIngestionService` to validate all incoming plates
- Suspicious plates automatically flagged with `requiresReview=true`
- Creates review entry with suspicion reasons and confidence scores
- Session processing skipped until human review completed

### 5. Session Processing Integration ✅
- Updated `SessionService` to check `requiresReview` flag
- Movements requiring review are skipped during session processing
- After review approval/correction, movement is reprocessed automatically
- Full audit trail maintained throughout the process

### 6. Audit Logging ✅
New audit actions implemented:
- `PLATE_REVIEW_CREATED` - When suspicious plate is detected
- `PLATE_REVIEW_APPROVED` - When operator approves a plate
- `PLATE_REVIEW_CORRECTED` - When operator corrects a plate (includes old/new VRM)
- `PLATE_REVIEW_DISCARDED` - When operator discards a plate (includes reason)
- `PLATE_REPROCESSED` - When reviewed plate is reprocessed through session service

All actions include:
- Operator ID (actor)
- Timestamp
- Related entity IDs
- VRM for quick searching
- Full details of the action

### 7. Frontend UI ✅

#### PlateReviewQueue Component
Features:
- **Statistics Dashboard**: Real-time counts (pending, approved, corrected, discarded)
- **Advanced Filtering**: By site, validation status, review status, date range
- **Bulk Selection**: Checkbox selection with "select all" functionality
- **Bulk Actions**: Approve or discard multiple plates at once
- **Inline Editing**: Correct plates directly in the table
- **AI Suggestions**: Show correction suggestions based on OCR error patterns
- **Image Gallery**: Display plate images for visual verification
- **Pagination**: Handle large result sets efficiently
- **Notes Support**: Add notes when approving or correcting plates
- **Dark Mode**: Full dark mode support matching existing UI

Integrated into main navigation:
- New "Plate Review" menu item with ScanEye icon
- Positioned before "Review Queue" for logical workflow

### 8. Validation Rules ✅
Default UK validation patterns:
- **UK Standard (2001+)**: `AB12CDE` format
- **UK Prefix (1983-2001)**: `A123BCD` format
- **UK Suffix (1963-1983)**: `ABC123D` format
- **UK Dateless (Pre-1963)**: `AB1234` format
- **International Generic**: Alphanumeric 2-10 characters

Seed script provided: `scripts/seed-validation-rules.ts`

### 9. Suspicion Detection ✅
Automatically flags plates for:
- Low confidence scores (< 0.8)
- Special characters (non-alphanumeric)
- Repeated characters (e.g., "AAAAA")
- All zeros
- Invalid length (< 2 or > 10 characters)
- Suspicious patterns (e.g., "III111", "OOO000")
- Invalid format (doesn't match any validation rule)
- Non-UK format (could be international or misread)

### 10. OCR Error Correction ✅
AI-powered suggestions for common OCR errors:
- 0 ↔ O (zero to/from letter O)
- 1 ↔ I (one to/from letter I)
- 5 ↔ S (five to/from letter S)
- 8 ↔ B (eight to/from letter B)
- 2 ↔ Z (two to/from letter Z)
- 6 ↔ G (six to/from letter G)

Suggestions validated and ranked by confidence score.

### 11. Documentation ✅
- **Comprehensive System Documentation**: `docs/PLATE_REVIEW_SYSTEM.md`
  - Architecture overview
  - API reference
  - Integration flow diagrams
  - Usage examples
  - Troubleshooting guide
  - Best practices
- **E2E Tests**: `test/plate-review.e2e-spec.ts`
  - Plate validation tests
  - ANPR ingestion integration tests
  - Review action tests
  - Bulk operation tests
  - Statistics tests

## Files Created

### Backend
- `src/domain/entities/plate-review.entity.ts` - PlateReview entity
- `src/domain/entities/plate-validation-rule.entity.ts` - PlateValidationRule entity
- `src/plate-review/services/plate-validation.service.ts` - Validation service
- `src/plate-review/services/plate-review.service.ts` - Review management service
- `src/plate-review/plate-review.controller.ts` - REST API controller
- `src/plate-review/plate-review.module.ts` - NestJS module
- `scripts/seed-validation-rules.ts` - Seed script for default rules
- `test/plate-review.e2e-spec.ts` - End-to-end tests

### Frontend
- `frontend/src/components/PlateReviewQueue.tsx` - Review queue UI component

### Documentation
- `docs/PLATE_REVIEW_SYSTEM.md` - Comprehensive system documentation
- `PLATE_REVIEW_IMPLEMENTATION.md` - This file

### Modified Files
- `src/app.module.ts` - Added PlateReviewModule import
- `src/domain/entities/movement.entity.ts` - Added requiresReview flag
- `src/ingestion/services/anpr-ingestion.service.ts` - Added plate validation integration
- `src/ingestion/ingestion.module.ts` - Added PlateReviewModule dependency
- `src/engine/services/session.service.ts` - Added requiresReview check
- `frontend/src/App.tsx` - Added Plate Review route and navigation

## How It Works

### Flow Diagram
```
┌─────────────────┐
│  ANPR Camera    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   ANPR Ingestion Service        │
│   - Normalize VRM                │
│   - Validate plate               │
│   - Detect suspicious patterns   │
└────────┬────────────────────────┘
         │
         ▼
    Is Suspicious?
         │
    ┌────┴────┐
    │         │
   Yes       No
    │         │
    ▼         ▼
┌──────────────────┐  ┌─────────────────┐
│ Create Review    │  │ Process Session │
│ requiresReview   │  │ Normally        │
│ = true           │  └─────────────────┘
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  Human Review Queue  │
│  - Approve           │
│  - Correct           │
│  - Discard           │
└────────┬─────────────┘
         │
    ┌────┴────┬─────────┐
    │         │         │
 Approve   Correct   Discard
    │         │         │
    ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Clear   │ │ Update  │ │ Mark    │
│ Review  │ │ VRM     │ │ Invalid │
│ Flag    │ │ Clear   │ │         │
└────┬────┘ │ Flag    │ └─────────┘
     │      └────┬────┘
     │           │
     └─────┬─────┘
           │
           ▼
┌──────────────────┐
│ Reprocess        │
│ Through Session  │
│ Service          │
└──────────────────┘
```

## Setup Instructions

### 1. Database Setup
The system will automatically create tables in development mode (synchronize: true).

For production:
```bash
# Generate migration
npm run migration:generate -- -n AddPlateReviewSystem

# Run migration
npm run migration:run
```

### 2. Seed Validation Rules
```bash
npm run ts-node scripts/seed-validation-rules.ts
```

### 3. Start the Application
```bash
# Backend
npm run start:dev

# Frontend
cd frontend
npm run dev
```

### 4. Access the UI
Navigate to the application and click on "Plate Review" in the sidebar.

## Testing

### Run E2E Tests
```bash
npm run test:e2e test/plate-review.e2e-spec.ts
```

### Manual Testing
1. **Send suspicious ANPR event**:
```bash
curl -X POST http://localhost:3000/ingestion/anpr \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "SITE01",
    "vrm": "0OO123ABC",
    "timestamp": "2024-01-29T12:00:00Z",
    "confidence": 0.65,
    "cameraId": "CAM01",
    "direction": "ENTRY"
  }'
```

2. **Check review queue**:
```bash
curl http://localhost:3000/plate-review/queue?reviewStatus=PENDING
```

3. **Get correction suggestions**:
```bash
curl http://localhost:3000/plate-review/{reviewId}/suggestions
```

4. **Approve the plate**:
```bash
curl -X POST http://localhost:3000/plate-review/{reviewId}/approve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "operator123",
    "notes": "Verified correct"
  }'
```

## Configuration Options

### Adjust Confidence Threshold
In `src/plate-review/services/plate-validation.service.ts`:
```typescript
// Lower threshold = more plates flagged
if (confidence !== undefined && confidence < 0.8) {
  reasons.push(`LOW_CONFIDENCE:${confidence.toFixed(2)}`);
}
```

### Add Custom Validation Rule
```sql
INSERT INTO plate_validation_rules (name, pattern, region, priority, description)
VALUES (
  'German Standard',
  '^[A-Z]{1,3}[A-Z]{1,2}[0-9]{1,4}$',
  'EU',
  5,
  'German format: 1-3 area letters, 1-2 letters, 1-4 numbers'
);
```

### Customize OCR Substitutions
In `src/plate-review/services/plate-validation.service.ts`, modify the `OCR_SUBSTITUTIONS` array.

## Monitoring

### Key Metrics to Track
- Review queue size (alert if > 100)
- Average review time
- Correction rate
- Discard rate
- Top suspicion reasons

### Audit Queries
```sql
-- Plates reviewed today
SELECT COUNT(*) FROM plate_reviews
WHERE DATE(reviewed_at) = CURRENT_DATE;

-- Correction rate
SELECT
  COUNT(*) FILTER (WHERE review_status = 'CORRECTED') * 100.0 / COUNT(*) as correction_rate
FROM plate_reviews
WHERE reviewed_at IS NOT NULL;

-- Top suspicion reasons
SELECT reason, COUNT(*)
FROM plate_reviews,
     LATERAL unnest(suspicion_reasons) as reason
GROUP BY reason
ORDER BY COUNT(*) DESC
LIMIT 10;
```

## Future Enhancements

### Short Term
- [ ] User authentication and permissions
- [ ] Email notifications for pending reviews
- [ ] Export review reports
- [ ] Camera-specific confidence tuning

### Long Term
- [ ] Machine learning model for automatic correction
- [ ] Integration with DVLA for UK plate validation
- [ ] Mobile app for on-site review
- [ ] Advanced analytics dashboard

## Support

For questions or issues:
1. Check `docs/PLATE_REVIEW_SYSTEM.md` for detailed documentation
2. Review audit logs in the database
3. Check application logs for errors
4. Contact the development team

## Conclusion

The Plate Review System is now fully implemented and integrated into the existing ANPR parking management system. It provides:

✅ **Automatic detection** of suspicious plates
✅ **Human review workflow** with approve/correct/discard actions
✅ **AI-powered suggestions** for OCR error correction
✅ **Full audit trail** of all review actions
✅ **Integration** with session processing and parking events
✅ **User-friendly UI** with bulk operations support
✅ **Comprehensive documentation** and tests

The system ensures data quality while maintaining operational efficiency through bulk actions and intelligent automation.
