# Next Steps - Development Roadmap

**Last Updated:** January 27, 2026

## Immediate Priorities (This Week)

### 1. ✅ Port Cleanup on Startup
**Status:** Ready to implement  
**Priority:** High (User Requirement)  
**Estimated Time:** 30 minutes

Add port cleanup logic to `main.ts` to free the port before launching for a clean start.

### 2. ⚠️ Fix Payment Time Window Validation
**Status:** TODO in code  
**Priority:** High (Critical Bug)  
**Estimated Time:** 2-3 hours

**Location:** `src/engine/services/rule-engine.service.ts:45`

Current issue: Payment validation only checks if payment exists, not if it covers the session duration.

**Required:**
- Validate payment `startTime <= session.startTime`
- Validate payment `expiryTime >= session.endTime`
- Handle edge cases (payment starts after entry, expires before exit)

### 3. ⚠️ Implement Payment Reconciliation Trigger
**Status:** TODO in code  
**Priority:** High  
**Estimated Time:** 1-2 hours

**Location:** `src/ingestion/services/payment-ingestion.service.ts:31`

When a payment arrives (especially late), trigger re-evaluation of affected sessions.

**Required:**
- Find sessions that might be affected by new payment
- Re-run rule engine for those sessions
- Update decisions if outcome changes

### 4. ⚠️ Write First Unit Tests
**Status:** Infrastructure ready, tests needed  
**Priority:** High (0% coverage)  
**Estimated Time:** 4-6 hours

Start with critical services:
- `RuleEngineService` - Payment, permit, grace period logic
- `SessionService` - Entry/exit processing
- `AnprIngestionService` - Data ingestion

**Target:** 50%+ coverage on critical paths

## Short Term (Next 2 Weeks)

### 5. Database Migrations
**Status:** Using `synchronize: true`  
**Priority:** High (Production blocker)  
**Estimated Time:** 3-4 hours

- Create initial migration
- Set up migration scripts
- Document migration process
- Disable `synchronize` in production config

### 6. Data Reconciliation Service
**Status:** Not implemented  
**Priority:** High (Spec requirement)  
**Estimated Time:** 6-8 hours

**Required:**
- Background job to re-evaluate sessions
- Trigger on payment/permit creation/update
- Update decisions when outcomes change
- Log all reconciliation actions

### 7. Error Handling Enhancement
**Status:** Basic implementation  
**Priority:** Medium  
**Estimated Time:** 4-6 hours

- Structured error responses
- Error logging with context
- Error monitoring setup
- User-friendly error messages

### 8. Health Check Endpoints
**Status:** Not implemented  
**Priority:** Medium  
**Estimated Time:** 1-2 hours

- `/health` - Basic health check
- `/health/db` - Database connectivity
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe

## Medium Term (Next Month)

### 9. Complete Test Coverage
**Status:** Infrastructure ready  
**Priority:** High  
**Estimated Time:** 20-30 hours

- Unit tests for all services (target: 80%+)
- Integration tests for all API endpoints
- E2E tests for critical flows
- Frontend component tests

### 10. Enforcement Lifecycle Completion
**Status:** Partial implementation  
**Priority:** Medium  
**Estimated Time:** 8-10 hours

- Batch archival functionality
- Export to external systems
- Full status tracking (EXPORTED, CLOSED)
- Enforcement packaging

### 11. Frontend API Integration
**Status:** Components exist, API calls missing  
**Priority:** Medium  
**Estimated Time:** 6-8 hours

- Connect frontend to backend APIs
- Error handling in UI
- Loading states
- Real-time updates (polling or WebSocket)

### 12. Production Configuration
**Status:** Development config only  
**Priority:** High  
**Estimated Time:** 4-6 hours

- Environment-specific configs
- CORS restrictions
- Database connection pooling
- Logging configuration
- Security headers

## Long Term (Next Quarter)

### 13. Authentication & Authorization
**Status:** Not implemented  
**Priority:** High (Security)  
**Estimated Time:** 15-20 hours

- JWT-based authentication
- Role-based access control
- API key management
- Session management

### 14. Real-Time Access Control
**Status:** Not implemented  
**Priority:** Low (Future feature)  
**Estimated Time:** 20-30 hours

- Barrier integration
- Live decision endpoints
- Fail-safe mechanisms
- Manual override handling

### 15. Advanced Features
**Status:** Not implemented  
**Priority:** Low  
**Estimated Time:** Variable

- Occupancy tracking
- Appeals workflow
- Enhanced reporting
- Multi-client isolation

## Current Blockers

1. **No Tests** - Can't confidently refactor or add features
2. **Payment Validation Bug** - Incorrect compliance decisions
3. **No Reconciliation** - Late payments/permits not handled
4. **Production Config** - Can't deploy safely

## Quick Wins (Can Do Today)

1. ✅ Port cleanup (30 min)
2. ✅ Fix Decision entity params type (already done)
3. ⚠️ Add health check endpoint (1 hour)
4. ⚠️ Write first unit test (2 hours)
5. ⚠️ Fix payment time window (2-3 hours)

## Progress Tracking

- [ ] Port cleanup implemented
- [ ] Payment time window fixed
- [ ] Payment reconciliation trigger added
- [ ] First unit tests written
- [ ] Database migrations set up
- [ ] Data reconciliation service implemented
- [ ] Error handling enhanced
- [ ] Health checks added
- [ ] Test coverage > 50%
- [ ] Production configuration ready

## Notes

- Focus on high-priority items first
- Test as you go (TDD approach recommended)
- Update STATE_OF_PLAY.md as items are completed
- Keep documentation up to date
