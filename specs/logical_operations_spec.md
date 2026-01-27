# Parking Operations & Real-Time Control System
## Logical Operations Specification (Consolidated)

### 1. Purpose and Scope

This system is a multi-client, multi-site parking operations platform designed to manage ANPR-based parking activity across a wide range of car park types.

It supports:

- ANPR-only pay & display sites
- ANPR sites with whitelists or permits
- Free-stay car parks
- Permit-only sites
- Real-time barrier-controlled and mixed-mode sites (current or future)

The system is modular and site-configurable, allowing different camera manufacturers, payment providers, and access-control mechanisms to coexist under a single operational framework.

This document describes how the system works logically and operationally, focusing on:

- parking event processing
- decision-making
- human review
- enforcement handling
- real-time access control
- audit and data retention

It intentionally avoids technical implementation details.

### 2. Core Operational Principles

**Data preservation first**
All inbound data is preserved exactly as received. Decisions are layered on top of immutable records.

**Site rules define behaviour**
Every decision is driven by per-site configuration. The same vehicle event may be compliant at one site and enforceable at another.

**Human approval for enforcement**
No enforcement proceeds without operator review and approval.

**Late-arriving data is expected**
Payment and whitelist data may arrive after parking events and must be reconciled continuously.

**Auditability over automation**
Every outcome must be explainable: what happened, why it happened, and when the decision was made.

**Real-time control and enforcement coexist**
Live access decisions do not remove the need for enforcement logic or audit trails.

### 3. Clients, Sites, and Isolation
#### 3.1 Clients

A client is an organisation responsible for one or more parking sites.

- Clients are fully isolated from each other.
- Clients do not access this operations system directly.
- Client-facing dashboards and tools exist on a separate platform.

#### 3.2 Sites

A site represents a single physical car park.

Each site defines:

- operating model (pay & display, free stay, permit-only, barrier-controlled, etc.)
- grace periods (entry grace, exit grace, overstay tolerance)
- camera layout and directions
- payment and whitelist sources
- enforcement thresholds
- whether the site operates in real-time control mode

All logic, decisions, and outcomes are site-scoped.

### 4. Inbound Data and Preservation
#### 4.1 Parking-Related Signals

The system ingests multiple signal types, including:

- ANPR camera events (VRM, timestamp, images, metadata)
- payment records (real-time or delayed)
- whitelist and permit updates
- access control signals (barriers, overrides – where applicable)

#### 4.2 Raw Data Preservation

Upon receipt:

- inbound data is stored exactly as received
- associated images are preserved and linked
- original timestamps and identifiers are retained

Raw data is never overwritten or altered and forms the basis of all audits.

### 5. Normalisation and Interpretation
#### 5.1 Manufacturer Normalisation

Different camera manufacturers provide data in different formats.

Each inbound event is converted into a standard internal representation used by the system for processing, while the original record remains intact.

Anomalies such as:

- missing images
- duplicate events
- low confidence reads
- timing inconsistencies

are flagged for awareness and review.

#### 5.2 Camera Direction and Movement Mapping

Each site defines:

- which cameras represent entry, exit, or internal circulation
- the physical direction of travel per camera

Using this configuration, camera events are interpreted as vehicle movement events, representing arrival, departure, or pass-through intent.

### 6. Parking Session Construction
#### 6.1 Session Creation

The system attempts to form parking sessions by associating movement events.

A session represents:

- vehicle presence within a site
- entry time and exit time (where available)
- calculated duration

Multiple sessions per vehicle per day are supported, using site rules and timing windows to prevent mis-pairing.

#### 6.2 Missing or Incomplete Data

Missing entry or exit data is treated as an exception, not an automatic enforcement.

Such cases:

- remain provisional
- are flagged for investigation
- require operator review before any enforcement decision

### 7. Rule Evaluation and Classification

Once sessions or movements are identified, site rules are applied.

Each case is classified as one of the following:

#### 7.1 Compliant Parking

Examples include:

- valid payment matched by VRM
- valid whitelist or permit (permanent or temporary)
- free-stay conditions satisfied
- grace periods respected

#### 7.2 Pass-Through / No Action

Examples include:

- non-parking movements
- unusable or invalid reads
- site-defined exclusions
- test or maintenance activity

#### 7.3 Enforcement Candidate

Examples include:

- overstay beyond grace
- no valid payment
- permit breach
- non-whitelisted vehicle at restricted site

Each outcome produces a decision record documenting:

- data considered
- rules applied
- rationale for the decision

### 8. Continuous Reconciliation and Late Data
#### 8.1 Payment and Whitelist Re-Checking

Payment and whitelist data may arrive late (e.g. daily imports).

The system continuously:

- re-evaluates provisional sessions
- matches new data by VRM, site, and time window
- updates outcomes accordingly

#### 8.2 Outcome Adjustment

If new data alters a decision:

- enforcement candidates may be removed from review
- approved cases may be blocked from export
- all changes are logged with reasons and timestamps

### 9. Real-Time Controlled Sites (Live Access Mode)
#### 9.1 Definition

Some sites operate in real-time control mode, where the system actively authorises vehicle access.

Examples include:

- barrier-controlled car parks
- pay-on-exit sites
- controlled-access permit sites
- mixed-mode enforcement and access sites

Each site explicitly declares whether it is:

- **Non-real-time** (observational / post-event enforcement)
or
- **Real-time** (live decision and control)

#### 9.2 Real-Time Decision Flow

At real-time sites:

1. A vehicle is detected at a control point (entry or exit).
2. The event is ingested and preserved.
3. The system immediately evaluates:
   - payment status
   - whitelist or permit validity
   - grace and access rules
4. An access decision is made:
   - allow access
   - deny access
   - allow under exception

#### 9.3 Access vs Enforcement

Real-time access decisions do not replace enforcement logic.

A vehicle may be allowed to exit but still have an earlier unpaid session.

Manual overrides always generate audit records.

Access decisions, sessions, and enforcement cases remain logically separate but linked.

#### 9.4 Failure and Fallback Behaviour

Each real-time site defines fallback rules, such as:

- fail-open or fail-closed behaviour
- exit protection if systems are unavailable
- manual operator overrides

All fallback actions are logged and reviewable.

### 10. Human Review Workflow
#### 10.1 Review Queue

All enforcement candidates enter a review queue.

The operator can:

- approve enforcement
- decline enforcement
- mark for further investigation

#### 10.2 Review Context

The operator is presented with:

- entry and exit images
- timestamps and durations
- payment and whitelist status
- flagged anomalies
- full audit history

Operator decisions are final and logged.

### 11. Enforcement Packaging and Lifecycle
#### 11.1 Approval and Archival

Approved enforcements are grouped into batches and archived.

Each archive includes:

- structured enforcement details
- one folder per case
- entry and exit images
- associated metadata

#### 11.2 Enforcement Lifecycle Tracking

Each enforcement is tracked through defined states, including:

- candidate
- approved
- archived
- exported
- closed

Lifecycle status is available internally and to external systems via API.

### 12. Audit, Retention, and Compliance
#### 12.1 Retention Policy

- Enforcement records and evidence: 3 years
- All other operational data: 3 weeks

#### 12.2 Audit Logging

All actions are logged, including:

- data ingestion
- rule evaluations
- operator decisions
- access authorisations
- exports and status changes

Audit logs provide full traceability for compliance and dispute resolution.

### 13. External Systems and Client Portals

This platform is operations-only.

- Clients access a separate portal
- This system supplies:
  - live and historical statistics
  - configuration snapshots
  - enforcement lifecycle updates

No control or enforcement actions are exposed externally.

### 14. Future Expansion (Non-Blocking)

The logical design supports future additions without architectural change:

- barrier integrations
- occupancy and multi-storey logic
- customer self-service whitelists
- appeals and dispute handling
- enhanced evidence integrity controls
