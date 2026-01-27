# Payment Tracking System

## Overview

The Payment Tracking System provides real-time payment validation for ANPR-controlled barriers and comprehensive payment management across all car parks. It supports multiple payment sources (payment machines, apps, kiosks) and provides fast, reliable access control decisions.

## Features

### 1. Real-Time Payment Validation
- **Barrier Control** - Fast validation (< 100ms) for ANPR-controlled barriers
- **Multi-Site Support** - Works across all car parks
- **Time-Based Validation** - Check payment validity at any point in time
- **Automatic Expiry Handling** - Payments automatically expire at their expiry time

### 2. Payment Ingestion
- **API Endpoint** - Direct payment ingestion via REST API
- **Webhook Support** - Accept payments from external payment modules
- **Multiple Sources** - Support for payment machines, apps, kiosks, manual entry
- **Audit Logging** - All payments are logged in the audit system

### 3. Payment Status & Monitoring
- **Real-Time Status** - Check payment status for any vehicle
- **Active Payments** - List all active payments for a site
- **Expiring Payments** - Get payments expiring soon (for notifications)
- **Statistics** - Payment statistics and revenue tracking

### 4. Integration Ready
- **Payment Module Support** - Designed for future payment module integrations
- **Webhook Format** - Flexible webhook payload handling
- **API Keys** - Ready for API key authentication (future)

## API Endpoints

### Real-Time Validation

#### Validate Payment for Access
```
GET /api/payment/validate/:siteId/:vrm
```

**Purpose:** Real-time payment check for barrier control

**Parameters:**
- `siteId` - Site identifier
- `vrm` - Vehicle Registration Mark
- `timestamp` (optional) - Check payment at specific time (default: now)

**Response:**
```json
{
  "valid": true,
  "payment": {
    "id": "uuid",
    "vrm": "ABC123",
    "siteId": "site-1",
    "amount": 5.00,
    "startTime": "2026-01-27T10:00:00Z",
    "expiryTime": "2026-01-27T14:00:00Z",
    "source": "KIOSK"
  },
  "expiresAt": "2026-01-27T14:00:00Z",
  "remainingMinutes": 240
}
```

**Use Case:** ANPR barrier checks this endpoint when a vehicle approaches. If `valid: true`, barrier lifts.

**Performance:** Optimized for < 100ms response time with proper database indexes.

### Payment Ingestion

#### Ingest Payment (API)
```
POST /api/payment/ingest
Content-Type: application/json
```

**Request Body:**
```json
{
  "siteId": "site-1",
  "vrm": "ABC123",
  "amount": 5.00,
  "startTime": "2026-01-27T10:00:00Z",
  "expiryTime": "2026-01-27T14:00:00Z",
  "source": "KIOSK",
  "externalReference": "TXN-12345"
}
```

**Response:**
```json
{
  "id": "uuid",
  "siteId": "site-1",
  "vrm": "ABC123",
  "amount": 5.00,
  "startTime": "2026-01-27T10:00:00Z",
  "expiryTime": "2026-01-27T14:00:00Z",
  "source": "KIOSK",
  "externalReference": "TXN-12345",
  "ingestedAt": "2026-01-27T10:00:01Z"
}
```

#### Payment Webhook
```
POST /api/payment/webhook
Content-Type: application/json
```

**Purpose:** Accept payments from external payment modules/machines

**Request Body (Flexible Format):**
```json
{
  "siteId": "site-1",
  "vrm": "ABC123",
  "amount": 5.00,
  "startTime": "2026-01-27T10:00:00Z",
  "expiryTime": "2026-01-27T14:00:00Z",
  "source": "PAYMENT_MACHINE",
  "reference": "TXN-12345"
}
```

**Alternative Formats Supported:**
- `site_id`, `vehicleRegistration`, `paymentAmount`, `start_time`, `expiry_time`
- `plateNumber`, `validFrom`, `validUntil`
- `transactionId`, `expiresAt`

The webhook endpoint automatically normalizes different payload formats.

### Payment Status

#### Get Payment Status
```
GET /api/payment/status/:siteId/:vrm
```

**Response:**
```json
{
  "vrm": "ABC123",
  "siteId": "site-1",
  "hasActivePayment": true,
  "activePayments": [
    {
      "id": "uuid",
      "amount": 5.00,
      "startTime": "2026-01-27T10:00:00Z",
      "expiryTime": "2026-01-27T14:00:00Z",
      "source": "KIOSK"
    }
  ],
  "nextExpiry": "2026-01-27T14:00:00Z",
  "totalPayments": 1
}
```

### Monitoring & Statistics

#### Get Active Payments for Site
```
GET /api/payment/active/:siteId
```

Returns all currently active payments for a site.

#### Get Payment Statistics
```
GET /api/payment/statistics/:siteId?startDate=2026-01-27&endDate=2026-01-28
```

**Response:**
```json
{
  "totalPayments": 150,
  "activePayments": 45,
  "expiredPayments": 105,
  "totalRevenue": 750.00,
  "averageAmount": 5.00
}
```

#### Get Expiring Payments
```
GET /api/payment/expiring/:siteId?minutes=30
```

Returns payments expiring within the specified minutes (default: 30).

#### Check Payment Machine Status
```
GET /api/payment/machine-enabled/:siteId
```

**Response:**
```json
{
  "enabled": true
}
```

## Integration Examples

### Payment Machine Integration

A payment machine can send payments via webhook:

```javascript
// Payment machine sends webhook after successful payment
fetch('https://api.pos.com/api/payment/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    siteId: 'site-1',
    vrm: 'ABC123',
    amount: 5.00,
    startTime: new Date().toISOString(),
    expiryTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
    source: 'PAYMENT_MACHINE',
    reference: 'TXN-12345'
  })
});
```

### Barrier Control Integration

An ANPR-controlled barrier checks payment before lifting:

```javascript
// Barrier system checks payment when vehicle detected
async function checkVehicleAccess(vrm, siteId) {
  const response = await fetch(
    `https://api.pos.com/api/payment/validate/${siteId}/${vrm}`
  );
  const result = await response.json();
  
  if (result.valid) {
    // Lift barrier
    liftBarrier();
    logAccess('GRANTED', vrm, result.payment.id);
  } else {
    // Deny access
    denyAccess();
    logAccess('DENIED', vrm, result.reason);
  }
}
```

### Mobile App Integration

A mobile app can check payment status:

```javascript
// Check if user's vehicle has active payment
const status = await fetch(
  `https://api.pos.com/api/payment/status/${siteId}/${vrm}`
).then(r => r.json());

if (status.hasActivePayment) {
  showMessage(`Payment active until ${status.nextExpiry}`);
} else {
  showPaymentOptions();
}
```

## Database Schema

### Payment Entity

```typescript
{
  id: string;                    // UUID
  siteId: string;                // Site identifier
  vrm: string;                   // Vehicle Registration Mark
  amount: number;                // Payment amount
  startTime: Date;              // Payment start time
  expiryTime: Date;             // Payment expiry time
  source: string;               // Payment source (KIOSK, APP, MACHINE, etc.)
  externalReference?: string;    // External transaction reference
  rawData?: any;                // Original payment data
  ingestedAt: Date;             // When payment was ingested
}
```

### Indexes

- `(vrm, siteId)` - Fast VRM lookups
- `(expiryTime)` - Expiry queries
- `(siteId, startTime, expiryTime)` - Active payment queries
- `(siteId, expiryTime)` - Expiring payment queries

## Performance

### Optimization

- **Indexed Queries** - All queries use proper database indexes
- **Fast Validation** - Real-time validation optimized for < 100ms
- **Caching Ready** - Architecture supports caching layer (future)
- **Connection Pooling** - Efficient database connection management

### Response Times

- **Real-Time Validation:** < 100ms (target)
- **Status Queries:** < 200ms
- **Statistics:** < 500ms
- **Webhook Processing:** < 300ms

## Security

### Current

- **Input Validation** - All inputs validated via DTOs
- **VRM Normalization** - Automatic VRM normalization
- **Audit Logging** - All payment operations logged

### Future Enhancements

- **API Key Authentication** - For payment module integrations
- **Webhook Signatures** - Verify webhook authenticity
- **Rate Limiting** - Prevent abuse
- **IP Whitelisting** - Restrict webhook sources

## Audit Trail

All payment operations are logged in the audit system:

- **Payment Ingestion** - `PAYMENT_INGESTED`
- **Access Granted** - `ACCESS_GRANTED` (with payment details)
- **Access Denied** - `ACCESS_DENIED_NO_PAYMENT`

## Error Handling

### Validation Errors

- Missing required fields
- Invalid date formats
- Invalid VRM format
- Invalid site ID

### Business Logic Errors

- Payment already exists
- Invalid time range (expiry before start)
- Site not found

All errors return appropriate HTTP status codes and error messages.

## Future Enhancements

1. **Payment Module SDK** - Standardized SDK for payment module developers
2. **Payment Plans** - Support for recurring payments, subscriptions
3. **Payment Methods** - Track payment methods (card, cash, mobile)
4. **Refunds** - Handle payment refunds
5. **Payment Analytics** - Advanced analytics and reporting
6. **Multi-Currency** - Support for different currencies
7. **Payment Notifications** - SMS/Email notifications for expiring payments
8. **Payment History** - User-facing payment history

## Testing

### Unit Tests
- Payment validation logic
- Time-based validation
- Status queries
- Statistics calculations

### Integration Tests
- Webhook ingestion
- Real-time validation
- Barrier control flow
- Multi-site scenarios

### Performance Tests
- Response time under load
- Concurrent validation requests
- Database query optimization

## Monitoring

### Metrics to Track

- Validation response times
- Payment ingestion rate
- Active payments count
- Access granted/denied ratio
- Webhook success/failure rate

### Alerts

- High validation latency
- Payment ingestion failures
- Unusual access denial patterns
- Webhook endpoint errors
