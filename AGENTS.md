# Hennos - Agent Context Documentation

## Project Overview

**Hennos** is an agentic chat bot powered by multiple LLM (Large Language Model) providers. It provides conversational AI capabilities across multiple platforms (Telegram, Discord, REST API) with support for text, image, documents, and voice inputs.

The bot implements a sophisticated permission system, tool calling capabilities, and uses Temporal for workflow orchestration.

**Repository**: repkam09/telegram-gpt-bot  
**Main Branch**: main

## Technology Stack

- **Runtime**: Node.js v24+
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Workflow Engine**: Temporal.io
- **LLM Providers**: OpenAI, Ollama
- **Bot Frameworks**: node-telegram-bot-api, discord.js
- **Testing**: Vitest
- **Build Tools**: npm-run-all, rimraf
- **Containerization**: Docker, Docker Compose
- **Additional Tools**: Puppeteer (web scraping), Axios, Express

## Architecture

### Core Components

1. **Entry Point** ([src/hennos.ts](src/hennos.ts))
   - Initializes the database
   - Starts client instances (Telegram, Discord, Webhook API)
   - Launches the Temporal worker

2. **Temporal Worker** ([src/worker.ts](src/worker.ts))
   - Connects to Temporal server
   - Registers workflows and activities
   - Handles distributed workflow execution
   - Task Queue: Configured via `TEMPORAL_TASK_QUEUE` env var

3. **Client Layer** ([src/client/](src/client/))
   - `telegram.ts` - Telegram bot integration (primary interface)
   - `discord.ts` - Discord bot integration (basic)
   - `api.ts` - Webhook/API endpoints
   - `cli.ts` - Command-line testing interface

4. **Provider Abstraction** ([src/provider.ts](src/provider.ts))
   - Unified interface for multiple LLM providers
   - Supports OpenAI (high/mini models), Ollama
   - Handles tool calling, moderation, and completions
   - Level-based model selection (high/low)

5. **Database & Models** ([prisma/schema.prisma](prisma/schema.prisma))
   - **User**: User profiles with permissions, preferences, location
   - **Group**: Group chat configurations
   - **Messages**: Conversation history
   - **KeyValueMemory**: Key-value storage per user
   - **FutureTask**: Scheduled tasks/reminders
   - **HennosLink**: Web interface links
   - **Blacklist**: Blocked users
   - **WorkflowMessage**: Temporal workflow messages
   - **WorkflowChat**: Workflow chat sessions

### Temporal Workflows

Located in [src/temporal/](src/temporal/):

- **agent/** - Agent workflow implementations
- **gemstone/** - Gemstone workflow (specialized agent)
- **legacy/** - Legacy workflow implementations
- **activities.ts** - Activity barrel exports
- **workflows.ts** - Workflow barrel exports

Each workflow type has its own:

- `workflow.ts` - Workflow definitions
- `activities/` - Activity implementations
- `tools.ts` - Tool definitions
- `types.ts` - Type definitions
- `interface.ts` - Workflow interfaces

### Tools System

Located in [src/tools/](src/tools/):

Hennos implements a comprehensive tool calling system with the following tools:

- **BaseTool.ts** - Abstract base class for all tools
- **BraveSearch.ts** - Web search via Brave API
- **PerplexitySearch.ts** - Search via Perplexity API
- **WolframAlpha.ts** - Computational knowledge
- **OpenWeatherMapLookupTool.ts** - Weather information
- **FetchWebpageContent.ts** - Web scraping with Puppeteer
- **CreateArtifact.ts** - Create shareable artifacts
- **HennosExternalArtifacts.ts** - Manage external artifacts
- **HennosMetaTools.ts** - Meta-tools for bot management
- **JellyseerMediaRequest.ts** - Media request integration
- **MiscFileRequestTool.ts** - File handling
- **PythonSandbox.ts** - Execute Python code in sandbox (Terrarium container)
- **tools.ts** - Tool processing engine

### Singletons

Located in [src/singletons/](src/singletons/):

- **config.ts** - Environment configuration and validation
- **logger.ts** - Pino-based logging with Axiom integration
- **ollama.ts** - Ollama client management
- **openai.ts** - OpenAI client management
- **speech.ts** - Text-to-speech capabilities
- **temporal.ts** - Temporal client management
- **transcription.ts** - Audio transcription

## Environment Configuration

Key environment variables (from [src/singletons/config.ts](src/singletons/config.ts)):

- `HENNOS_DEVELOPMENT_MODE` - Enable dev mode
- `HENNOS_VERBOSE_LOGGING` - Verbose logging
- `HENNOS_LLM_PROVIDER` - Default LLM provider (openai/ollama)
- `TELEGRAM_BOT_WEBHOOK_PORT` - Webhook port (optional)
- `TEMPORAL_HOST` - Temporal server host
- `TEMPORAL_PORT` - Temporal server port
- `TEMPORAL_NAMESPACE` - Temporal namespace
- `TEMPORAL_TASK_QUEUE` - Task queue name
- `DATABASE_URL` - SQLite database path
- Various API keys for LLM providers and tools

## Build & Development

### Scripts

```bash
npm run clean           # Remove build directory
npm run build           # Full build pipeline (clean + prisma + lint + tsc)
npm run validate        # Lint + type check (no emit)
npm run tsc:emit        # Compile TypeScript
npm run tsc:noemit      # Type check only
npm run lint            # ESLint with auto-fix
npm run dev             # Build + start locally
npm start               # Deploy migrations + start bot
npm start:cli           # Run CLI testing interface
npm test                # Run Vitest tests
npm run migrate:deploy  # Deploy Prisma migrations
npm run migrate:reset   # Reset database
npm run prisma:generate # Generate Prisma client
```

### Docker Deployment

**Build**:

```bash
docker build -t hennos-gpt .
```

**Run**:

```bash
docker compose up
```

The Docker setup includes:

- `hennos` - Main bot container (port 16006)
- `terrarium` - Python sandbox container (port 16007)

### Local Development

1. Copy `.env.dev` to `.env` and configure
2. Run `npm install`
3. Run `npm run dev`

### Testing

VSCode debugger configurations available in `.vscode/launch.json` for:

- Testing bot interactions outside Telegram
- Debugging specific workflows
- CLI interface testing

## Key Features

### Multi-Modal Input Support

- Text messages
- Voice messages (transcription)
- Image input (vision models)
- Document processing

### Tool Calling

- Extensible tool system
- Async tool execution
- Tool result caching
- Error handling and fallbacks

### Conversation Management

- Context window management (token-based)
- Conversation history persistence
- System prompts and user preferences
- Multi-turn conversations

### Workflow Orchestration

- Temporal.io for distributed workflows
- Durable execution
- Activity retries
- Workflow versioning

## Development Notes

### Code Style

- ESLint for linting with auto-fix
- TypeScript with strict mode configurations
- Consistent use of async/await
- Comprehensive type definitions

### Database Migrations

- Prisma for schema management
- Migrations tracked in `prisma/migrations/`
- BigInt used for chat IDs (Telegram requirement)
- DateTime with default `now()`

### Logging

- Pino logger with pretty printing in dev
- Axiom integration for production logs
- Structured logging with `workflowId` context
- Separate log levels for Temporal components

### Error Handling

- Try-catch blocks in critical paths
- Graceful degradation for tool failures
- User-friendly error messages
- Detailed logging for debugging

## Testing

- **Framework**: Vitest
- **Test Files**: `tests/` directory
- **Temporal Testing**: `@temporalio/testing` package
- **Coverage**: Tools and workflows

Run tests with:

```bash
npm run test
```

## Deployment

Current deployment uses:

- Docker containerization
- Docker Compose orchestration
- Caddy reverse proxy (Caddyfile)
- Production scripts: `deploy.sh`, `container.sh`

## Future Improvements

Based on code structure and TODOs:

- Expand Discord and Twitch integrations
- Improve test coverage
- Add more sophisticated workflow types
- Enhanced artifact system
- Better voice synthesis options
- Conversation export/import

