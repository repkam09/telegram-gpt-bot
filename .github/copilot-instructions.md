# Hennos Development Guide

## Architecture Overview

This is a Temporal.io-based agentic chatbot with multi-platform support (Telegram, Discord, CLI, REST API). The core is **workflow orchestration** - clients signal workflows, workflows call activities, activities execute tools and LLM calls.

### Critical Pattern: Client → Signal → Workflow → Activity → Tool

1. **Clients** ([src/client/](../src/client/)) receive messages and start/signal workflows via Temporal
2. **Workflows** ([src/temporal/](../src/temporal/)) orchestrate agent logic using signals and queries (durable, resumable)
3. **Activities** ([src/temporal/agent/activities/](../src/temporal/agent/activities/)) wrap stateful operations (DB, LLM, tools)
4. **Tools** ([src/tools/](../src/tools/)) extend `BaseTool` with `isEnabled()`, `definition()`, `callback()`

## Key Workflows

- **agent/** - Main agentic workflow with thought/action/observation loop
- **gemstone/** - Specialized variant with different behavior
- **legacy/** - Original implementation (pre-agentic)

Each workflow dir contains: `workflow.ts`, `activities/`, `interface.ts`, `tools.ts`, `types.ts`

## Activity Proxy Pattern

Activities use `proxyActivities()` with **different timeout tiers** based on operation:
```typescript
// Quick operations: 15s timeout, 5 retries
const { persistUserMessage } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: { backoffCoefficient: 1, initialInterval: "3 seconds", maximumAttempts: 5 }
});

// LLM calls: 5 minutes timeout
const { thought, action } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes", ...
});
```

## LLM Provider Abstraction

[src/provider.ts](../src/provider.ts) abstracts OpenAI, Anthropic, Ollama behind unified interface:
```typescript
const provider = resolveModelProvider("high" | "low");
await provider.completion(workflowId, messages, iterations, tools);
```

Models selected via `HENNOS_LLM_PROVIDER` env var. High = GPT-4, Low = GPT-4-mini.

## Tool Development

Extend `BaseTool` in [src/tools/](../src/tools/):
```typescript
export class MyTool extends BaseTool {
    static isEnabled() { return !!Config.MY_TOOL_API_KEY; }
    static definition(): Tool { return { type: "function", function: {...} }; }
    static async callback(workflowId, args, metadata): Promise<[string, any]> { ... }
}
```

Register in [src/temporal/agent/tools.ts](../src/temporal/agent/tools.ts) and re-export from [src/tools/tools.ts](../src/tools/tools.ts).

## Database Patterns

SQLite + Prisma ORM. **BigInt for chat IDs** (Telegram requirement):
```typescript
const db = Database.instance();
await db.user.findUnique({ where: { telegramId: BigInt(chatId) } });
```

Migrations: `npm run migrate:deploy` (production) or `npm run migrate:new` (dev).

## Response Handling

[src/response.ts](../src/response.ts) uses listener pattern for multi-client responses:
```typescript
AgentResponseHandler.registerListener("telegram", async (message, chatId) => {
    await TelegramInstance.sendMessageWrapper(chatId, message);
});
```

Workflows call `sendAgentResponse(workflowId, message)` activity, which routes to all registered listeners.

## Development Workflow

```bash
npm run dev          # Clean build + start (runs migrations)
npm run validate     # Lint + type check (no build)
npm test             # Run Vitest tests
npm run start:cli    # Interactive CLI testing (no Telegram)
```

**Critical**: Always run `npm run build` after changing tool definitions or workflow signatures. Temporal workers need compiled code.

## Configuration

All config in [src/singletons/config.ts](../src/singletons/config.ts). Environment variables validated at startup. Use `.env.dev` as template.

Key vars:
- `HENNOS_LLM_PROVIDER` - openai|ollama|anthropic
- `TEMPORAL_HOST/PORT/NAMESPACE/TASK_QUEUE` - Temporal connection
- `TELEGRAM_BOT_KEY` - Bot token
- `DATABASE_URL` - SQLite path

## Testing

Vitest with Temporal testing framework. See [tests/temporal/](../tests/temporal/) for workflow test patterns:
```typescript
import { TestWorkflowEnvironment } from "@temporalio/testing";
const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
```

## Common Pitfalls

1. **Temporal workflows are deterministic** - no direct I/O, use activities for anything stateful
2. **Chat IDs are BigInt** - convert with `BigInt(chatId)` for DB operations
3. **Activities need timeout configuration** - default 10s often too short for LLM calls
4. **Tools must be registered** in both workflow's tool list AND activity processor
5. **Workflow code runs in isolated V8 context** - can't import node modules directly, use activities

## Quick Reference

- Entry point: [src/hennos.ts](../src/hennos.ts)
- Temporal worker: [src/worker.ts](../src/worker.ts)
- Schema: [prisma/schema.prisma](../prisma/schema.prisma)
- Deployment: `docker compose up`
- Logs: Pino logger ([src/singletons/logger.ts](../src/singletons/logger.ts)) with Axiom integration