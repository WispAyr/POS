# Parking Operations System (POS)

[![CI](https://github.com/WispAyr/POS/workflows/CI/badge.svg)](https://github.com/WispAyr/POS/actions)
[![Tests](https://github.com/WispAyr/POS/workflows/Tests/badge.svg)](https://github.com/WispAyr/POS/actions)
[![Security Scan](https://github.com/WispAyr/POS/workflows/Security%20Scan/badge.svg)](https://github.com/WispAyr/POS/actions)

A multi-site, multi-client ANPR-based parking management platform for processing vehicle movements, evaluating parking compliance, and managing enforcement workflows.

## Overview

The Parking Operations System is designed to manage parking operations across multiple sites and clients. It processes ANPR (Automatic Number Plate Recognition) events, creates parking sessions, evaluates compliance using configurable rules, and manages enforcement workflows with human-in-the-loop review.

### Key Features

- **ANPR Event Processing** - Ingests and processes vehicle movement events from cameras
- **Plate Review System** - AI-powered validation and human review for suspicious plates
- **Session Management** - Automatically creates and manages parking sessions
- **Rule Engine** - Evaluates compliance based on payments, permits, and grace periods
- **Enforcement Workflow** - Human review queue for enforcement candidates
- **Multi-Site Support** - Site-specific configuration and rules
- **Monday.com Integration** - Syncs sites, permits, and camera configurations
- **Full Audit Trail** - Comprehensive logging of all system actions
- **Dashboard** - React-based admin interface with dark mode support

## Technology Stack

- **Backend:** NestJS 11.x, TypeScript, PostgreSQL, TypeORM
- **Frontend:** React 19.x, TypeScript, Vite, Tailwind CSS
- **Database:** PostgreSQL
- **Integration:** Monday.com API

## Quick Start

### Prerequisites

- Node.js 18+ (recommended: 20+)
- PostgreSQL 12+ (recommended: 14+)
- npm 9+

### Installation

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Configuration

Create a `.env` file in the root directory:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=pos_user
DB_PASSWORD=pos_pass
DB_DATABASE=pos_db

MONDAY_API_KEY=your_api_key_here  # Optional
```

### Database Setup

```bash
# Create database
createdb pos_db

# Seed plate validation rules (after first run)
npm run ts-node scripts/seed-validation-rules.ts
```

### Running the Application

```bash
# Start backend (Terminal 1)
npm run start:dev

# Start frontend (Terminal 2)
cd frontend
npm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173

## Documentation

- **[STATE_OF_PLAY.md](./STATE_OF_PLAY.md)** - Current status, implemented features, and known issues
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development guide, architecture, and setup
- **[API.md](./API.md)** - API endpoint documentation
- **[PLATE_REVIEW_SYSTEM.md](./docs/PLATE_REVIEW_SYSTEM.md)** - Plate review system documentation
- **[specs/logical_operations_spec.md](./specs/logical_operations_spec.md)** - Logical operations specification

## Project Structure

```
POS/
├── src/                    # Backend source (NestJS)
│   ├── api/               # API endpoints
│   ├── audit/             # Audit logging service
│   ├── domain/            # Domain entities
│   ├── engine/            # Session & rule engine
│   ├── enforcement/       # Enforcement workflow
│   ├── ingestion/         # Data ingestion
│   ├── integration/       # External integrations
│   ├── plate-review/      # Plate validation & review
│   └── infrastructure/    # Infrastructure services
├── frontend/              # React frontend
│   └── src/
│       └── components/   # React components
├── test/                  # E2E tests
├── docs/                  # Documentation
├── scripts/               # Utility scripts
├── specs/                 # Specifications
└── uploads/              # Image storage
```

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development guide.

### Available Scripts

```bash
# Backend
npm run start:dev      # Development mode with watch
npm run build          # Build for production
npm run test           # Run unit tests
npm run test:e2e       # Run E2E tests
npm run lint           # Lint code
npm run format         # Format code

# Frontend
cd frontend
npm run dev            # Development server
npm run build          # Build for production
npm run lint           # Lint code
```

## Current Status

**Development Status:** 🟢 Production Ready

The system has comprehensive functionality implemented:
- ✅ ANPR event processing with plate validation
- ✅ Plate review system with AI-powered correction
- ✅ Session management and rule engine
- ✅ Enforcement workflow with human review
- ✅ Full audit trail and logging
- ✅ Multi-site support with Monday.com integration
- ✅ React dashboard with dark mode

See [STATE_OF_PLAY.md](./STATE_OF_PLAY.md) for detailed status.

## API Documentation

See [API.md](./API.md) for complete API documentation.

### Key Endpoints

- `POST /ingestion/anpr` - Ingest ANPR events
- `GET /api/events` - Get ANPR movements
- `GET /plate-review/queue` - Get plate review queue
- `POST /plate-review/:id/approve` - Approve reviewed plate
- `GET /enforcement/queue` - Get enforcement review queue
- `POST /enforcement/review/:id` - Review enforcement decision

## CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI Pipeline** - Linting, building, testing, and type checking
- **Test Suite** - Comprehensive test execution with coverage
- **Security Scanning** - Dependency audits and CodeQL analysis
- **PR Checks** - Automated validation for pull requests
- **Release Workflow** - Automated releases on version tags

See [.github/workflows/README.md](.github/workflows/README.md) for detailed workflow documentation.

### Status Badges

Update the badge URLs in this README with your GitHub username:
```markdown
[![CI](https://github.com/YOUR_USERNAME/POS/workflows/CI/badge.svg)](https://github.com/YOUR_USERNAME/POS/actions)
```

## License

UNLICENSED - Private project
