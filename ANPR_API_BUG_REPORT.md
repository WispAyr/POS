# ANPR API Bug Report - Incomplete Pagination Fix

**Date:** 2026-01-28
**Service:** `http://anpr.parkwise.cloud/api/ingest/detections`
**Reporter:** POS System Integration Team
**Severity:** High - Blocking production deployment

---

## Executive Summary

While the recent pagination fix (applied earlier today) partially resolved the string length error, the fix is **incomplete**. The API still fails when requesting data over longer time periods (hours > 1), regardless of the limit parameter.

---

## Issue Description

The API endpoint continues to return HTTP 500 errors with the message:
```json
{
  "success": false,
  "error": "Cannot create a string longer than 0x1fffffe8 characters"
}
```

This error occurs when `hours` parameter is set to values greater than 1, even with small `limit` values.

---

## Root Cause Analysis

Based on testing, the pagination fix only works when the **total dataset size** (determined by the `hours` parameter) is small. The issue suggests:

1. **Query Phase:** The database query or file read operation is still loading ALL records within the time range BEFORE applying the limit
2. **Processing Phase:** All loaded records are being processed/transformed before pagination
3. **Serialization Phase:** Only after processing does the API attempt to serialize, at which point it's too late

**Expected Behavior:**
- Apply `LIMIT` clause in the database query itself (SQL: `SELECT * FROM detections WHERE timestamp > ? LIMIT ?`)
- For file storage: Stop reading files once limit is reached
- Never load more records into memory than requested by the `limit` parameter

---

## Test Results

### ✅ Working Cases
| limit | hours | offset | Result | Count Returned |
|-------|-------|--------|--------|----------------|
| 1     | 1     | 0      | ✅ Success | 1 detection |
| 5     | 1     | 0      | ✅ Success | 4 detections |

### ❌ Failing Cases
| limit | hours | offset | Result | Error |
|-------|-------|--------|--------|-------|
| 5     | 24    | 0      | ❌ 500 | String length exceeded |
| 10    | 24    | 0      | ❌ 500 | String length exceeded |
| 100   | 24    | 0      | ❌ 500 | String length exceeded |
| 1     | 6     | 0      | ❌ 500 | String length exceeded |

**Pattern:** API fails when `hours > 1`, regardless of how small the `limit` is set.

---

## Reproduction Steps

```bash
# Test 1: Works with hours=1
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=5&hours=1&offset=0"
# Returns: {"success":true,"count":4,...}

# Test 2: Fails with hours=24, even with limit=1
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=1&hours=24&offset=0"
# Returns: {"success":false,"error":"Cannot create a string longer than 0x1fffffe8 characters"}

# Test 3: Fails with hours=6
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=5&hours=6&offset=0"
# Returns: {"success":false,"error":"Cannot create a string longer than 0x1fffffe8 characters"}
```

---

## Technical Details

**Error Details:**
- **Error Code:** `0x1fffffe8` = 536,870,888 characters (Node.js max string length)
- **HTTP Status:** 500 Internal Server Error
- **Server:** nginx/1.24.0 (Ubuntu) + Express
- **Rate Limits:** 5000 requests per 15 minutes (working correctly)

**Response Headers:**
```
Server: nginx/1.24.0 (Ubuntu)
Content-Type: application/json; charset=utf-8
X-Powered-By: Express
RateLimit-Policy: 5000;w=900
RateLimit-Limit: 5000
```

---

## Impact on POS System

### Current State
- ✅ Automatic polling every 5 minutes: **WORKING** (defaults to 1 hour)
- ❌ Manual batch sync for 6+ hours: **BROKEN**
- ❌ Manual batch sync for 24 hours: **BROKEN**
- ❌ Historical data import for 7 days: **BROKEN**
- ❌ Camera discovery: **DEGRADED** (only sees last hour)

### Business Impact
1. **Cannot perform initial data synchronization** - Need to sync historical data from past 7 days
2. **Limited camera discovery** - Only discovering cameras active in last hour
3. **Missing detections** - Any downtime > 1 hour results in data loss
4. **Manual intervention required** - Operators must trigger sync every hour

### Workaround Currently Applied
We've modified our polling service to default to `hours=1` instead of `hours=24`. This allows basic operation but prevents:
- Bulk historical imports
- Recovery from extended downtime
- Full camera configuration discovery

---

## Suggested Fix (For Your Development Team)

### Option 1: Database-Level Pagination (Recommended)
```javascript
// BEFORE (current - loads all, then limits)
const allRecords = await db.query(
  'SELECT * FROM detections WHERE timestamp > ?',
  [startTime]
);
const limited = allRecords.slice(offset, offset + limit);

// AFTER (correct - limits at query level)
const limited = await db.query(
  'SELECT * FROM detections WHERE timestamp > ? LIMIT ? OFFSET ?',
  [startTime, limit, offset]
);
```

### Option 2: File Storage Early Exit
```javascript
// In storage.js
async function getDetections(hours, limit, offset) {
  const files = await getAllFilesInTimeRange(hours);
  let records = [];

  // IMPORTANT: Stop reading files once we have enough records
  for (const file of files) {
    if (records.length >= offset + limit) break; // ← Add this

    const fileRecords = await readFile(file);
    records.push(...fileRecords);
  }

  return records.slice(offset, offset + limit);
}
```

### Option 3: Streaming Response
Instead of loading all records into memory, stream them:
```javascript
app.get('/api/ingest/detections', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.write('{"detections":[');

  let count = 0;
  for await (const detection of getDetectionsStream(hours, limit, offset)) {
    if (count > 0) res.write(',');
    res.write(JSON.stringify(detection));
    count++;
  }

  res.write(']}');
  res.end();
});
```

---

## Verification Tests

Once fixed, please verify these test cases all return success:

```bash
# Test 1: Small limit, 24 hours
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=1&hours=24&offset=0"
# Expected: {"success":true,"count":1,...}

# Test 2: Medium limit, 24 hours
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=10&hours=24&offset=0"
# Expected: {"success":true,"count":10,...}

# Test 3: Standard limit, 24 hours
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=100&hours=24&offset=0"
# Expected: {"success":true,"count":100,...}

# Test 4: 7-day historical sync
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=100&hours=168&offset=0"
# Expected: {"success":true,"count":100,...}

# Test 5: Pagination (offset)
curl "http://anpr.parkwise.cloud/api/ingest/detections?limit=100&hours=24&offset=100"
# Expected: {"success":true,"count":100,"offset":100,...}
```

---

## Request for Timeline

**Critical Questions:**
1. What is the ETA for the complete fix?
2. Can we get access to a staging/beta endpoint to test the fix before production deployment?
3. Are there any alternative endpoints or API versions we can use in the interim?
4. Is there database query logging we can review to confirm the issue?

---

## Additional Information

### Our Use Case
- **Polling Frequency:** Every 5 minutes (automated)
- **Typical Query:** `limit=100, hours=1` (workaround)
- **Desired Query:** `limit=100, hours=24` (for reliability)
- **Batch Import:** `limit=100, hours=168, offset=0...N` (for initial sync)

### Our Environment
- **System:** POS (Parking Operations System)
- **Framework:** NestJS 11.x
- **HTTP Client:** Axios
- **Expected Data Volume:** ~10-50 detections per hour per site, 69 sites total

---

## Contact Information

For clarification or follow-up questions:
- **System:** POS Frontend/Backend Integration
- **Priority:** High - Blocking deployment to production
- **Response Requested:** Within 24 hours

---

## Appendix: Previous Fix Reference

**Your Fix Summary (from earlier today):**
> "Problem: The API was processing all records before applying pagination, causing Node.js string length errors when serializing large datasets."
>
> "Solution: Applied pagination BEFORE processing (line 244 in ingest.js)"

**Status:** Partially effective - works for `hours=1` but not for `hours>1`

**This Report:** Requests completion of the pagination fix to work with all time ranges, not just 1-hour windows.
