# RFC: Telegram Bot with MCP Integration

## Overview

Create a Telegram bot service that can:
1. Respond to messages and commands
2. Send notifications/alerts proactively
3. Expose an MCP (Model Context Protocol) server for Claude integration
4. Execute whitelisted scripts/functions remotely
5. Provide a small web UI for monitoring and control

## Location

```
/Users/noc/operations/telegram-bot/
```

Separate from POS but can interact with POS and Unifi services.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Telegram Bot Service                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Telegram   │  │     MCP      │  │      Web UI          │  │
│  │   Handler    │  │    Server    │  │   (Dashboard)        │  │
│  │              │  │              │  │                      │  │
│  │ - Commands   │  │ - Tools      │  │ - Status             │  │
│  │ - Messages   │  │ - Resources  │  │ - Logs               │  │
│  │ - Callbacks  │  │ - Prompts    │  │ - Controls           │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └────────────┬────┴──────────────────────┘              │
│                      │                                          │
│              ┌───────▼───────┐                                  │
│              │  Core Service │                                  │
│              │               │                                  │
│              │ - Auth        │                                  │
│              │ - Executor    │                                  │
│              │ - Logger      │                                  │
│              └───────┬───────┘                                  │
│                      │                                          │
├──────────────────────┼──────────────────────────────────────────┤
│                      │           Integrations                   │
│  ┌───────────┐  ┌────▼────┐  ┌───────────┐  ┌───────────────┐  │
│  │    POS    │  │ Script  │  │   Unifi   │  │   System      │  │
│  │   API     │  │ Runner  │  │   API     │  │   Health      │  │
│  └───────────┘  └─────────┘  └───────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
/Users/noc/operations/telegram-bot/
├── src/
│   ├── main.ts                      # Bootstrap entry
│   ├── app.module.ts                # Root NestJS module
│   │
│   ├── telegram/                    # Telegram bot module
│   │   ├── telegram.module.ts
│   │   ├── telegram.service.ts      # Bot initialization & lifecycle
│   │   ├── telegram.update.ts       # Command/message handlers
│   │   └── guards/
│   │       └── auth.guard.ts        # User whitelist guard
│   │
│   ├── mcp/                         # MCP server module
│   │   ├── mcp.module.ts
│   │   ├── mcp.service.ts           # MCP server setup
│   │   ├── tools/                   # MCP tool definitions
│   │   │   ├── telegram.tools.ts    # send_message, get_updates
│   │   │   ├── system.tools.ts      # server_status, restart_service
│   │   │   ├── pos.tools.ts         # pos_stats, enforcement_queue
│   │   │   └── script.tools.ts      # execute_script
│   │   └── resources/               # MCP resources
│   │       └── logs.resource.ts     # Log file access
│   │
│   ├── executor/                    # Script execution module
│   │   ├── executor.module.ts
│   │   ├── executor.service.ts      # Sandboxed script runner
│   │   └── scripts.whitelist.ts     # Allowed scripts config
│   │
│   ├── integrations/                # External service integrations
│   │   ├── integrations.module.ts
│   │   ├── pos.service.ts           # POS API client
│   │   ├── unifi.service.ts         # Unifi API client
│   │   └── system.service.ts        # System health checks
│   │
│   ├── ui/                          # Web dashboard
│   │   ├── ui.module.ts
│   │   ├── ui.controller.ts         # Serve dashboard
│   │   └── public/                  # Static assets
│   │       ├── index.html
│   │       ├── styles.css
│   │       └── app.js
│   │
│   ├── common/                      # Shared utilities
│   │   ├── filters/
│   │   │   └── exception.filter.ts
│   │   ├── interceptors/
│   │   │   └── logging.interceptor.ts
│   │   └── decorators/
│   │       └── authorized-user.decorator.ts
│   │
│   └── config/                      # Configuration
│       ├── config.module.ts
│       └── config.schema.ts         # Validation schema
│
├── scripts/                         # Executable scripts
│   ├── restart-pos.sh
│   ├── restart-frontend.sh
│   ├── check-health.sh
│   ├── clear-logs.sh
│   └── backup-db.sh
│
├── test/
│   ├── telegram.spec.ts
│   ├── mcp.spec.ts
│   └── executor.spec.ts
│
├── package.json
├── tsconfig.json
├── nest-cli.json
├── ecosystem.config.js              # PM2 config
├── .env.example
└── README.md
```

## Components Detail

### 1. Telegram Bot Module

**Technology**: `grammy` (modern, TypeScript-first Telegram bot framework)

**Commands**:
| Command | Description |
|---------|-------------|
| `/start` | Welcome message and help |
| `/status` | System status overview |
| `/pos` | POS system stats |
| `/enforcement` | Enforcement queue summary |
| `/logs [service]` | Recent logs |
| `/restart [service]` | Restart a service |
| `/health` | Health check all services |
| `/exec [script]` | Execute whitelisted script |

**Features**:
- Inline keyboards for interactive responses
- Callback query handling
- Message threading for long outputs
- Rate limiting per user
- Audit logging of all commands

**Security**:
- Telegram user ID whitelist (env: `AUTHORIZED_USERS`)
- Command-level permissions
- All actions logged with user context

### 2. MCP Server Module

**Technology**: `@modelcontextprotocol/sdk`

**Transport**: stdio (for Claude Desktop) + HTTP (for remote access)

**Tools**:

```typescript
// Telegram Tools
send_telegram_message(user_id: string, message: string): Promise<void>
broadcast_message(message: string): Promise<void>
get_recent_messages(limit: number): Promise<Message[]>

// System Tools
get_server_status(): Promise<SystemStatus>
restart_service(name: 'pos-backend' | 'pos-frontend' | 'telegram-bot'): Promise<void>
get_pm2_status(): Promise<PM2Status[]>

// POS Tools
get_pos_stats(): Promise<POSStats>
get_enforcement_queue(limit: number): Promise<EnforcementItem[]>
get_plate_reviews(status: string, limit: number): Promise<PlateReview[]>
approve_plate_review(id: string): Promise<void>

// Script Tools
list_scripts(): Promise<Script[]>
execute_script(name: string, args?: string[]): Promise<ExecutionResult>
```

**Resources**:
```typescript
// Log access
logs://pos-backend
logs://pos-frontend
logs://telegram-bot

// System info
system://health
system://processes
```

### 3. Script Executor Module

**Whitelist-only execution** - No arbitrary commands allowed.

**Configuration** (`scripts.whitelist.ts`):
```typescript
export const ALLOWED_SCRIPTS = {
  'restart-pos': {
    path: './scripts/restart-pos.sh',
    description: 'Restart POS backend service',
    requiresConfirmation: true,
    timeout: 30000,
  },
  'check-health': {
    path: './scripts/check-health.sh',
    description: 'Run health checks on all services',
    requiresConfirmation: false,
    timeout: 10000,
  },
  // ...
};
```

**Security**:
- Scripts run in subprocess with timeout
- stdout/stderr captured and returned
- Exit codes tracked
- All executions logged with user context

### 4. Web UI Module

**Simple dashboard** served at port 3001:

**Features**:
- Service status cards (green/red indicators)
- Recent command log
- Active users
- Quick action buttons
- Real-time updates via SSE

**Tech Stack**:
- Plain HTML + Tailwind CSS (via CDN)
- Vanilla JS with fetch API
- Server-Sent Events for live updates
- No build step required

**Routes**:
| Route | Description |
|-------|-------------|
| `GET /` | Dashboard page |
| `GET /api/status` | JSON status |
| `GET /api/logs` | Recent activity |
| `GET /api/events` | SSE stream |
| `POST /api/restart/:service` | Restart service |

### 5. Integrations Module

**POS Service**:
```typescript
@Injectable()
export class POSService {
  constructor(private http: HttpService) {}

  async getStats(): Promise<POSStats> {
    return this.http.get('http://localhost:3000/api/stats');
  }

  async getEnforcementQueue(): Promise<EnforcementItem[]> {
    return this.http.get('http://localhost:3000/enforcement/queue');
  }
}
```

**System Service**:
```typescript
@Injectable()
export class SystemService {
  async getPM2Status(): Promise<PM2Status[]> {
    const result = await exec('pm2 jlist');
    return JSON.parse(result.stdout);
  }

  async restartService(name: string): Promise<void> {
    await exec(`pm2 restart ${name}`);
  }
}
```

## Configuration

### Environment Variables

```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
AUTHORIZED_USERS=123456789,987654321

# MCP
MCP_TRANSPORT=stdio  # or 'http'
MCP_HTTP_PORT=3002

# Services
POS_API_URL=http://localhost:3000
UNIFI_API_URL=http://localhost:3000

# UI
UI_PORT=3001
UI_ADMIN_PASSWORD=secure_password

# Logging
LOG_LEVEL=info
LOG_DIR=/Users/noc/operations/telegram-bot/logs
```

### PM2 Configuration

```javascript
module.exports = {
  apps: [
    {
      name: 'telegram-bot',
      script: 'dist/main.js',
      cwd: '/Users/noc/operations/telegram-bot',
      instances: 1,
      autorestart: true,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

## Security Considerations

1. **Authentication**
   - Telegram user ID whitelist (not username - IDs are immutable)
   - Optional password for sensitive commands
   - Session tokens for web UI

2. **Authorization**
   - Command-level permissions
   - Script whitelist (no shell injection)
   - Rate limiting (10 commands/minute per user)

3. **Audit Trail**
   - All commands logged with timestamp, user, input, output
   - Log rotation (7 days retention)
   - Alerting on failed auth attempts

4. **Network**
   - Web UI on localhost only by default
   - MCP HTTP transport requires auth token
   - No external exposure without VPN/tunnel

## Implementation Phases

### Phase 1: Core Bot (MVP)
- [ ] Project scaffolding with NestJS
- [ ] Telegram bot with basic commands (`/start`, `/status`, `/help`)
- [ ] User authentication (whitelist)
- [ ] Basic logging

### Phase 2: Service Integration
- [ ] POS API integration
- [ ] System health checks
- [ ] PM2 status/control
- [ ] Script executor with whitelist

### Phase 3: MCP Server
- [ ] MCP SDK integration
- [ ] Tool definitions
- [ ] Resource providers
- [ ] stdio + HTTP transport

### Phase 4: Web UI
- [ ] Dashboard HTML/CSS
- [ ] Status API endpoints
- [ ] SSE for real-time updates
- [ ] Admin controls

### Phase 5: Polish
- [ ] Error handling improvements
- [ ] Rate limiting
- [ ] Comprehensive logging
- [ ] Documentation
- [ ] Tests

## Dependencies

```json
{
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/axios": "^4.0.0",
    "@nestjs/serve-static": "^5.0.0",
    "grammy": "^1.25.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "axios": "^1.7.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "jest": "^30.0.0",
    "ts-jest": "^30.0.0"
  }
}
```

## Testing Strategy

1. **Unit Tests**: Service methods, guards, utilities
2. **Integration Tests**: API endpoints, Telegram command handlers
3. **E2E Tests**: Full command flow simulation
4. **Manual Testing**: Telegram bot interaction, MCP with Claude

## Rollout Plan

1. Create project structure and basic bot
2. Test locally with development bot token
3. Add to PM2 ecosystem
4. Configure MCP in Claude Desktop
5. Document usage for team

## Open Questions

1. Should the MCP server run as a separate process or embedded?
2. Do we need database persistence for audit logs?
3. Should we integrate with the existing POS database?
4. What scripts should be in the initial whitelist?

---

**Author**: Claude
**Date**: 2026-01-29
**Status**: Draft - Pending Review
