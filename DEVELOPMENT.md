# Development Guide

## Getting Started

### Prerequisites

- **Node.js:** v18+ (recommended: v20+)
- **PostgreSQL:** v12+ (recommended: v14+)
- **npm:** v9+ (comes with Node.js)

### Initial Setup

1. **Clone and Install Dependencies**

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

2. **Database Setup**

```bash
# Create PostgreSQL database
createdb pos_db

# Or using psql
psql -U postgres -c "CREATE DATABASE pos_db;"
```

3. **Environment Configuration**

Create a `.env` file in the root directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=pos_user
DB_PASSWORD=pos_pass
DB_DATABASE=pos_db

# Monday.com Integration (optional)
MONDAY_API_KEY=your_api_key_here
MONDAY_CAMERA_BOARD_ID=1952030503
```

4. **Start Development Servers**

```bash
# Terminal 1: Backend (with port cleanup)
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

The backend will be available at `http://localhost:3000`  
The frontend will be available at `http://localhost:5173` (Vite default)

---

## Project Structure

```
POS/
├── src/                    # Backend source code
│   ├── api/               # API endpoints (dashboard, images)
│   ├── domain/            # Domain entities and core logic
│   │   └── entities/      # TypeORM entities
│   ├── engine/            # Session processing and rule engine
│   ├── enforcement/       # Enforcement workflow
│   ├── ingestion/         # Data ingestion (ANPR, payments, permits)
│   ├── infrastructure/    # Infrastructure services
│   ├── integration/       # External integrations (Monday.com)
│   ├── app.module.ts      # Root module
│   └── main.ts            # Application entry point
├── frontend/              # React frontend
│   └── src/
│       ├── components/    # React components
│       ├── App.tsx        # Main app component
│       └── main.tsx       # Frontend entry point
├── test/                  # E2E tests
├── dist/                  # Compiled backend (generated)
├── uploads/               # Image storage (generated)
└── specs/                 # Specifications and documentation
```

---

## Architecture

### Backend Architecture (NestJS)

The backend follows a modular architecture with clear separation of concerns:

#### Modules

1. **Domain Module** (`src/domain/`)
   - Core business entities
   - Domain logic and types
   - No external dependencies

2. **Ingestion Module** (`src/ingestion/`)
   - Handles incoming data (ANPR, payments, permits)
   - Data normalization and validation
   - Image management

3. **Engine Module** (`src/engine/`)
   - Session processing (entry/exit matching)
   - Rule evaluation
   - Decision generation

4. **Enforcement Module** (`src/enforcement/`)
   - Review queue management
   - Operator workflows
   - Audit logging

5. **API Module** (`src/api/`)
   - Dashboard endpoints
   - Statistics
   - Image serving

6. **Integration Module** (`src/integration/`)
   - External system integrations
   - Monday.com sync

7. **Infrastructure Module** (`src/infrastructure/`)
   - Shared infrastructure services

### Data Flow

```
ANPR Event → Ingestion → Movement Entity
                          ↓
                    Session Service
                          ↓
                    Session Entity
                          ↓
                    Rule Engine
                          ↓
                    Decision Entity
                          ↓
                    Enforcement Queue
                          ↓
                    Operator Review
```

### Frontend Architecture

- **Framework:** React 19 with TypeScript
- **State Management:** Local component state (no Redux currently)
- **Styling:** Tailwind CSS
- **Build:** Vite
- **API Communication:** Axios (not yet implemented in components)

---

## Development Workflow

### Running Tests

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

**Note:** Currently, no tests are implemented. See STATE_OF_PLAY.md for details.

### Code Style

The project uses:
- **ESLint** for linting
- **Prettier** for formatting

```bash
# Lint
npm run lint

# Format
npm run format
```

### Building

```bash
# Backend
npm run build

# Frontend
cd frontend
npm run build
```

---

## Database

### TypeORM Configuration

The project uses TypeORM with PostgreSQL. In development, `synchronize: true` is enabled, which automatically syncs the schema. **This should be disabled in production.**

### Entities

All entities are in `src/domain/entities/`:

- **Site** - Parking site configuration
- **Movement** - ANPR camera events
- **Session** - Vehicle parking sessions
- **Decision** - Rule evaluation outcomes
- **Payment** - Payment records
- **Permit** - Whitelist/permit records
- **AuditLog** - System audit trail

### Migrations

**Current Status:** Not implemented. The project uses `synchronize: true` in development.

**To Implement Migrations:**

1. Install TypeORM CLI (if not already):
```bash
npm install -g typeorm
```

2. Generate migration:
```bash
typeorm migration:generate -n MigrationName
```

3. Run migrations:
```bash
typeorm migration:run
```

---

## API Development

### Adding a New Endpoint

1. **Create/Update Controller** in appropriate module
2. **Create DTO** for request validation (in `dto/` folder)
3. **Implement Service** logic
4. **Update Module** to export service
5. **Add to API Module** if needed

Example:

```typescript
// src/api/my-feature.controller.ts
import { Controller, Get } from '@nestjs/common';
import { MyFeatureService } from './my-feature.service';

@Controller('my-feature')
export class MyFeatureController {
  constructor(private readonly service: MyFeatureService) {}

  @Get()
  async getData() {
    return this.service.getData();
  }
}
```

### Request Validation

Use DTOs with `class-validator`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
```

---

## Frontend Development

### Adding a New Component

1. Create component in `frontend/src/components/`
2. Import and use in `App.tsx` or parent component
3. Add API calls using Axios (or fetch)

Example:

```typescript
// frontend/src/components/MyComponent.tsx
import { useState, useEffect } from 'react';

export function MyComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/endpoint')
      .then(res => res.json())
      .then(setData);
  }, []);

  return <div>{/* Component JSX */}</div>;
}
```

### API Integration

The frontend should connect to the backend API. Currently, components may need API integration. Use Axios or fetch:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
});
```

---

## Integration with Monday.com

The system integrates with Monday.com for:
- Site management
- Whitelist/permit management
- Camera configuration

### Setup

1. Get Monday.com API key
2. Add to `.env`: `MONDAY_API_KEY=your_key`
3. Configure board IDs (or use defaults)

### Syncing

```bash
# Trigger sync via API
POST /integration/monday/sync
```

Or implement scheduled sync using `@nestjs/schedule`.

---

## Image Management

Images are stored locally in `uploads/images/`. The `ImageService` handles:
- Downloading from external URLs
- Storing locally
- Serving via API

### Image Storage

- **Location:** `uploads/images/`
- **Naming:** `{uuid}-{type}.{ext}`
- **Types:** `plate`, `overview`

### API Endpoints

- `GET /api/images/:filename` - Serve image

---

## Debugging

### Backend

```bash
# Debug mode
npm run start:debug

# Then attach debugger on port 9229
```

### Frontend

- Use React DevTools browser extension
- Check browser console for errors
- Vite provides hot module replacement

### Database

```bash
# Connect to PostgreSQL
psql -U pos_user -d pos_db

# View tables
\dt

# Query data
SELECT * FROM movements LIMIT 10;
```

---

## Common Tasks

### Adding a New Entity

1. Create entity in `src/domain/entities/`
2. Export from `src/domain/entities/index.ts`
3. Add to DomainModule providers
4. Use in services via `@InjectRepository`

### Adding a New Service

1. Create service file
2. Add to module `providers`
3. Inject repositories or other services
4. Implement business logic

### Adding a New API Endpoint

1. Add method to controller
2. Create/use DTO for validation
3. Call service method
4. Return response

---

## Environment-Specific Configuration

### Development

- `NODE_ENV=development`
- Database sync enabled
- CORS allows all origins
- Verbose logging

### Production

- `NODE_ENV=production`
- Database sync disabled (use migrations)
- CORS restricted
- Structured logging
- Error handling enhanced

---

## Troubleshooting

### Port Already in Use

**Issue:** `EADDRINUSE: address already in use :::3000`

**Solution:** The project should include port cleanup logic. If not, manually:

```bash
# Find process
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)
```

Or implement port cleanup in `main.ts` (user requirement).

### Database Connection Issues

**Issue:** Cannot connect to PostgreSQL

**Solutions:**
1. Check PostgreSQL is running: `pg_isready`
2. Verify credentials in `.env`
3. Check database exists: `psql -l | grep pos_db`
4. Verify user permissions

### TypeORM Synchronization Issues

**Issue:** Schema not updating

**Solutions:**
1. Check `synchronize: true` in development
2. Restart server
3. Check entity decorators are correct
4. Review TypeORM logs

### Frontend Build Issues

**Issue:** Vite build errors

**Solutions:**
1. Clear `node_modules` and reinstall
2. Check TypeScript errors: `cd frontend && npx tsc --noEmit`
3. Verify Vite config
4. Check for dependency conflicts

---

## Best Practices

### Code Organization

- Keep modules focused and cohesive
- Use dependency injection
- Separate concerns (controllers, services, entities)
- Follow NestJS conventions

### Error Handling

- Use NestJS exception filters
- Log errors appropriately
- Return meaningful error messages
- Don't expose internal errors to clients

### Testing

- Write unit tests for services
- Write integration tests for controllers
- Test edge cases
- Maintain test coverage > 80%

### Security

- Validate all inputs
- Use DTOs for request validation
- Sanitize user input
- Implement authentication/authorization
- Use environment variables for secrets

### Performance

- Use database indexes appropriately
- Implement pagination for large datasets
- Cache frequently accessed data
- Optimize database queries
- Monitor performance metrics

---

## Contributing

1. Create a feature branch
2. Implement changes
3. Write/update tests
4. Update documentation
5. Submit pull request

---

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [Vite Documentation](https://vitejs.dev)

---

## Support

For issues or questions:
1. Check existing documentation
2. Review code comments
3. Check STATE_OF_PLAY.md for known issues
4. Review logical operations spec in `specs/`
