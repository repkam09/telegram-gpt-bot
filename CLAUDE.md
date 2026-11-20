# Hennos Development Guide

## Working Conventions

- Make code changes on a feature branch and open a pull request; never commit directly to `main`.
- CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, type checks (source and tests), build and tests. Node and npm versions are pinned in `.nvmrc` and `engines`, and `.npmrc` enables `engine-strict`, `min-release-age` and `strict-allow-scripts` (dependency install scripts are default-deny, so `npm run prisma:generate` must be run explicitly after installing; see [Install scripts](#install-scripts-allowscripts)).
- Path-scoped guidance for Temporal workflow code and its tests is in [.claude/rules/](.claude/rules/); it loads automatically when those files are in play.

## Architecture Overview

Hennos is a Telegram-first chatbot built on **Temporal.io**. Clients never call an LLM directly: they signal a long-lived workflow, the workflow calls activities, and activities call LLM providers and tools.

### Critical Pattern: Client → Signal → Workflow → Activity → Tool

1. **Clients** ([src/client/](src/client/)) receive messages and `signalWithStart` the legacy workflow
2. **Workflow** ([src/temporal/legacy/workflow.ts](src/temporal/legacy/workflow.ts)) is the durable conversation loop: classify → completion → tool calls → answer
3. **Activities** ([src/temporal/legacy/activities/](src/temporal/legacy/activities/)) wrap everything with side effects (DB, LLM, tools)
4. **Tools** ([src/tools/](src/tools/)) extend `BaseTool` with `isEnabled()`, `definition()`, `callback()`
5. **Responses** go back out through `AgentResponseHandler` ([src/response.ts](src/response.ts)) to whichever client listener owns that conversation's platform

Startup lives in [src/hennos.ts](src/hennos.ts): it initialises the database, starts whichever clients are enabled by `HENNOS_*_ENABLED` flags, creates/removes Temporal schedules, then starts the Temporal worker ([src/worker.ts](src/worker.ts)) in the same process.

## Workflows

All live in [src/temporal/](src/temporal/). Workflows are exported from [src/temporal/workflows.ts](src/temporal/workflows.ts) and their activities from [src/temporal/activities.ts](src/temporal/activities.ts). **A new workflow or activity must be added to both barrel files** or the worker will not register it.

| Dir         | Workflow                    | Purpose                                                                                                               |
| ----------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `legacy/`   | `legacyWorkflow`            | The conversation workflow. One per chat, waits for `legacyWorkflowMessage` signals.                                   |
| `email/`    | `reviewEmailWorkflow`       | Scheduled (every 4h, `HENNOS_GMAIL_ENABLED`): fetch Gmail, summarize, store the digest as context for the admin chat. |
| `search/`   | `searchWorkflow`            | One-shot search + summarize.                                                                                          |
| `supabase/` | `supabaseKeepaliveWorkflow` | Scheduled (every 24h) Supabase keepalive.                                                                             |
| `memory/`   | `memoryBatchWorkflow`       | Scheduled (daily 04:00 `America/New_York`, kill switch `HENNOS_MEMORY_EXTRACTION_ENABLED`, default on): nightly memory extraction. |

`legacy/` layout: `workflow.ts`, `activities/` (`action`, `classifier`, `completion`, `persist`), `interface.ts` (client-side helpers), `tools.ts`, `types.ts`.

### The legacy workflow loop

- Workflow ID is a JSON string: `{"platform": "...", "chatId": "...", "type": "legacy"}`. Build it with `createWorkflowId(platform, chatId)` in [interface.ts](src/temporal/legacy/interface.ts). **`chatId` must be numeric** (it is stored in `Messages.chatId`), and `parseWorkflowId` throws otherwise. `AgentResponseHandler` and tools recover the platform/chat by parsing this ID, so its shape is load-bearing.
- Clients use the helpers in `interface.ts`: `signalLegacyWorkflowMessage` (signalWithStart, triggers a reply), `signalLegacyWorkflowExternalContext` / `signalLegacyWorkflowImageMessage` (write to the `Messages` table only, no reply), `signalLegacyWorkflowAdminExternalContext` (target `TELEGRAM_BOT_ADMIN`).
- Loop: persist pending user messages → `classifyPromptComplexity` (picks the model tier; see below) → `legacyCompletion` → either broadcast/persist the answer, or run each requested tool with `legacyAction` in parallel and iterate. Conversation history is read from the `Messages` table, not held in workflow state; only tool call/response entries are kept in the workflow.
- An unrecoverable error in the loop broadcasts a generic error message and rethrows (fails the workflow). The next signalWithStart starts a fresh run.

## Activity Proxy Pattern

Activities use `proxyActivities()` with **different timeout tiers** based on operation:

```typescript
// Quick operations: 15s timeout, 5 retries
const { persistLegacyAgentMessage } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: { backoffCoefficient: 1, initialInterval: "3 seconds", maximumAttempts: 5 }
});

// LLM calls and tool execution: 15 minutes (local models can be slow)
const { legacyCompletion, legacyAction } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 minutes", ...
});
```

The classifier uses 1 minute / 3 attempts. Long activities can be wrapped with `withActivityHeartbeat` ([src/temporal/heartbeat.ts](src/temporal/heartbeat.ts)).

## LLM Provider Abstraction

[src/provider.ts](src/provider.ts) abstracts providers behind `InvokableModelProvider` (`limit()`, `invoke()`, `completion()`):

```typescript
const provider = await resolveModelProvider(
  workflowId,
  "high" | "low" | "nano",
);
await provider.completion(workflowId, messages, iterations, tools);
```

- LiteLLM is the only provider ([litellm.ts](src/singletons/litellm.ts)); local models such as Ollama are reached by pointing the LiteLLM proxy at them. `HennosOpenAIProvider` in `openai.ts` is the OpenAI-compatible chat client used for LiteLLM. Audio transcription and image generation also go through LiteLLM (`LITELLM_TRANSCRIPTION_MODEL`, `LITELLM_IMAGE_MODEL`). The only direct OpenAI usage left is the Realtime SIP handler (`OPENAI_API_KEY`).
- **Tier routing:** `classifyPromptComplexity` only does work when `HENNOS_CLASSIFIER_DECISION_MODEL` is set (otherwise everything uses the high tier). It asks a LiteLLM decision model four yes/no questions about the recent conversation through `/v1/decisions` ([decision.ts](src/temporal/legacy/activities/decision.ts)) and `chooseTier` combines them. Anything ambiguous goes high, a deep or context-dependent turn keeps the chat on the high tier for the next few turns, long messages skip the call, and any failure falls back to high. Tiers map to `LITELLM_LLM` (high), `LITELLM_MINI_LLM` (low) and `LITELLM_NANO_LLM` (nano), the last two defaulting to the first. The tier only changes the upstream model: context window and tool list are identical across tiers so provider prompt caching is not disturbed. Decisions are logged with their signals.
- `litellm` supports per-user BYOK keys (`UserBYOK` table, `LITELLM_BYOK_ENABLED`).
- Model names/limits come from the `Config.*_LLM` getters, not from hard-coded values.

## Tool Development

Extend `BaseTool` in [src/tools/](src/tools/):

```typescript
export class MyTool extends BaseTool {
    static isEnabled() { return !!Config.MY_TOOL_API_KEY; }
    static definition(): HennosTool { return { type: "function", function: {...} }; }
    static async callback(workflowId, args, metadata): Promise<[string, any]> { ... }
}
```

Register it in `LegacyTools` in [src/temporal/legacy/tools.ts](src/temporal/legacy/tools.ts). `availableTools()` filters by `isEnabled()` on every call, and `processDefinedToolCalls` in [src/tools/tools.ts](src/tools/tools.ts) dispatches by tool name. There is a single list; no second registration is needed. Add a lazy getter to `Config` for any API key.

Tools that need to notify the owner use `signalLegacyWorkflowAdminExternalContext`. The `memory` tool (`MemoryTool` + `tools/memory/MemoryFileStore.ts`) is a per-chat virtual `/memories` filesystem backed by the `MemoryFile` table. It is **not** registered for the chat model: memory is written only by the nightly extraction (see [Memory extraction](#memory-extraction)).

## Memory extraction

Memory writes happen only in a nightly batch, never in the live chat. Design and phases: the Hennos project doc `hennos-gated-memory-extraction-plan`.

- `memoryBatchWorkflow` ([src/temporal/memory/](src/temporal/memory/)) runs from the `memory-batch` Temporal Schedule (created/deleted at startup in [hennos.ts](src/hennos.ts) by `HENNOS_MEMORY_EXTRACTION_ENABLED`). One activity lists chats with new messages, then one `processChatMemory` activity per chat (bounded concurrency) runs the gate, the extraction and the watermark update.
- `MemoryExtractionState` stores a per-chat watermark (`lastMessageId`). A chat with no row is backfilled from its last `HENNOS_MEMORY_BACKFILL_MESSAGES` messages. Messages are processed oldest first in chunks of `HENNOS_MEMORY_CHUNK_MESSAGES`, at most `HENNOS_MEMORY_MAX_CHUNKS` per chat per run.
- Only messages of type `text` are extracted. Injected external context (email digests, feedback and notices sent to the admin chat, audio file transcripts) is stored with type `context` by `signalLegacyWorkflowExternalContext`; chat history and the classifier treat it like text, but the nightly extraction ignores it because it is not the user's own words.
- The gate ([gate.ts](src/temporal/memory/gate.ts)) asks the decision model (`HENNOS_MEMORY_DECISION_MODEL`, default `HENNOS_CLASSIFIER_DECISION_MODEL`) whether a chunk holds anything durable, a correction or a forget request; a gate error stops that chat for the night and keeps its watermark. A likely secret does not skip a chunk (that would drop its other facts for good); the extraction prompt enforces never-store and the run is logged with a `+secret_flagged` reason. Extraction ([extract.ts](src/temporal/memory/extract.ts)) runs a bounded tool loop on the low tier with the `memory` tool; the prompt holds the filing rules and the never-store list.
- Kill switch: `HENNOS_MEMORY_EXTRACTION_ENABLED` is **default-on** (only the string `"false"` disables it; `.env.dev` disables it). Disabling deletes the schedule on next startup and leaves files and watermarks untouched.
- **Exposure** (`HENNOS_MEMORY_ENABLED`, default off) changes only what the chat sees; it never writes. When on: (1) `buildMemoryContext` ([memoryContext.ts](src/tools/memory/memoryContext.ts)) adds a stable `<memory>` block to the system prompt (usage rules, `profile.md` + `preferences.md` within a budget, an index of the other files with their frontmatter descriptions); it only changes when the nightly run edits a file, so provider prompt caching is undisturbed. (2) `MemoryReadTool` registers a read-only `memory` tool whose callback rejects every command but `view`. (3) The chat window becomes extraction-aware ([window.ts](src/temporal/memory/window.ts)): last 15 messages plus anything newer than the watermark, capped at 100 (no extraction means the window stays at 100). (4) With a decision model set, the classifier makes a **separate, parallel** decision call with one yes/no predicate per candidate file (newest 30 with a description), so a refusal, timeout or error there can never change the model tier; files over 0.5, at most 3, are prepended to the latest user message inside `<memory-files>` (not a system message, so the stable system prompt and history stay cacheable) ([memorySelection.ts](src/temporal/legacy/activities/memorySelection.ts)). Any failure injects nothing.
- Review helper: `npm run script:memory -- dump|run|state <chatId>` prints a chat's memory files, runs the gate and extraction for one chat now (this writes memory and moves the watermark), or prints the watermark.
- Schedule tuning: `HENNOS_MEMORY_SCHEDULE_CRON`, `HENNOS_MEMORY_SCHEDULE_TZ`, `HENNOS_MEMORY_CONCURRENCY`.

## Clients

All clients live in [src/client/](src/client/); initialisation is gated by flags in [src/hennos.ts](src/hennos.ts).

- **Telegram** (`telegram.ts` + `legacy/legacy.ts`): polling by default, webhook mode when `HENNOS_API_ENABLED` and `TELEGRAM_BOT_WEBHOOK_EXTERNAL` are set. `TelegramInstance` handles the whitelist (`User.whitelisted`, skipped in development mode) and delegates every message type to `TelegramLegacyInstance`, which handles **private chats only**. Commands are in `legacy/commands.ts`.
- **REST/SSE API** (`api.ts`, `endpoints/`): Express on `HENNOS_API_PORT`. Routes: `/healthz`, Telegram webhook, `/legacy/conversation/:sessionId/{message,stream}`, `/hennos/realtime/sip` (OpenAI Realtime SIP voice calls, which do not use Temporal), plus Supabase login/auth when `HENNOS_SUPABASE_ENABLED`. The session ID must be numeric because it becomes the legacy `chatId`.
- **CLI** (`cli.ts`, `npm run start:cli`): development mode only; uses platform `cli` and a fixed chatId of `0`.

### Response Handling

[src/response.ts](src/response.ts) uses a listener-per-platform pattern for messages, artifacts and status events:

```typescript
AgentResponseHandler.registerMessageListener(
  "legacy",
  async (message, chatId) => {
    await TelegramInstance.sendMessageWrapper(chatId, message);
  },
);
```

Workflows call the `broadcastLegacyAgentMessage` activity, which parses the platform out of the workflow ID and calls that platform's listener. Registered platforms: `legacy` (Telegram), `webhook` (SSE streams), `cli`. A missing listener only logs a warning. **A new client must register listeners and use a matching platform string in its workflow IDs.** Listeners are in-memory, so they only work in the process that runs the activity.

## Database Patterns

SQLite + Prisma ORM ([prisma/schema.prisma](prisma/schema.prisma)). Telegram-era tables use **BigInt** chat IDs (`User`, `Group`, ...), while `Messages` (legacy conversation history) stores the chat ID as a number:

```typescript
const db = Database.instance();
await db.user.findUnique({ where: { chatId: BigInt(chatId) } });
await db.messages.create({
  data: { chatId: Number(chatId), role: "user", content, from: Number(chatId) },
});
```

`WorkflowMessage`, `WorkflowSession`, `WorkflowSessionLink` and `ModelContextProtocolServer` (+ `Headers`) are left over from the removed agent workflow. Nothing reads or writes them any more, but the tables are intentionally kept.

Migrations: `npm run migrate:deploy` (production, runs on `npm start`) or `npm run migrate:new` (dev, create-only).

## Development Workflow

Run the `npm` scripts directly (`npm run build`, `npm run validate`, `npm test`); the VS Code tasks in [.vscode/tasks.json](.vscode/tasks.json) wrap the same scripts.

**Critical**: Always run `build`, `validate`, and `test` after changing tool definitions or workflow signatures. Temporal workers run compiled code from `build/`.

When changing `legacyWorkflow` itself, remember that running workflows replay their history on the new code. Changes to the order or number of activity calls can cause non-determinism errors; use `patched()` or finish/terminate in-flight workflows.

## Dependency Maintenance

A weekly workflow ([.github/workflows/dependency-report.yml](.github/workflows/dependency-report.yml)) publishes `report.json` and `report.md` (outdated packages, `npm audit`, unused dependencies) to the `deps-report` branch, produced by [scripts/deps-report.mjs](scripts/deps-report.mjs). To act on it, run the manually triggered [Dependency update](.github/workflows/dependency-update.yml) workflow (`in-range` for lockfile-only updates, `major` with a list of packages for major upgrades). It validates with CI and opens the PR. The `update-dependencies` skill ([.claude/skills/update-dependencies/SKILL.md](.claude/skills/update-dependencies/SKILL.md)) describes the full procedure.

Run `scripts/deps-report.mjs` under the Node in `.nvmrc`: it exits with an error on any other Node version, and it runs `npm` from the same Node install as the script itself. An older npm ignores `min-release-age`, which makes the report list releases that cannot be installed yet.

### Install scripts (`allowScripts`)

Dependency install scripts are **default-deny**: `allowScripts` in [package.json](package.json) records the decisions and `strict-allow-scripts=true` in [.npmrc](.npmrc) makes an install fail (`ESTRICTALLOWSCRIPTS`) when a package has an unlisted install script. Only `puppeteer` is allowed (its postinstall downloads the Chrome that `fetch_webpage_content` needs); Prisma and the rest are denied, and the Prisma client is generated explicitly. The entry is pinned, so **updating puppeteer requires `npm install-scripts approve puppeteer`**. The decisions, how enforcement works and how to fix a failing install are in the "Install scripts" section of the `update-dependencies` skill.

## Configuration

All config is in [src/singletons/config.ts](src/singletons/config.ts) as lazy static getters that validate when read. Use `.env.dev` as the template for `.env`.

Key vars:

- `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_LLM` - LiteLLM proxy and the model (with context size) used for the high tier
- `HENNOS_TOOL_DEPTH` - max tool-call iterations before the model is forced to answer
- `HENNOS_{TELEGRAM,API,GMAIL,SUPABASE,MEMORY}_ENABLED` - feature flags; `HENNOS_MEMORY_EXTRACTION_ENABLED` is the exception and defaults to on
- `HENNOS_DEVELOPMENT_MODE` - skips the whitelist, enables CLI and static `public/` files
- `TEMPORAL_HOST/PORT/NAMESPACE/TASK_QUEUE/API_KEY/USE_TLS` - Temporal connection (Temporal Cloud supported)
- `TELEGRAM_BOT_KEY`, `TELEGRAM_BOT_ADMIN` - bot token and the admin chat that receives notifications
- `DATABASE_URL` - SQLite path

## Testing

Vitest (`npm test`) picks up `src/**/*.{test,spec}.ts` and `tests/**`. Tests are co-located with the code. `npm run tsc:test` type-checks tests (the main `tsconfig.json` excludes them); CI runs both.

- **Shared setup** ([tests/setup.ts](tests/setup.ts)): mocks `dotenv` and the `Logger`, and scrubs `HENNOS_*`/`TEMPORAL_*`/API-key env vars. Use `vi.stubEnv()` to set config in a test (restored automatically).
- **Ephemeral database** ([tests/helpers/database.ts](tests/helpers/database.ts)): `createTestDatabase()` copies a schema template (built once by [tests/global-setup.ts](tests/global-setup.ts)) into a temp SQLite file, points the `Database` singleton at it, and seeds a whitelisted user with `chatId` 0 (`TEST_CHAT_ID`). Call `testDb.reset()` in `beforeEach` and `testDb.cleanup()` in `afterAll`. Do not mock Prisma. Requires `npm run prisma:generate` first.
- **Workflow tests** use `TestWorkflowEnvironment.createTimeSkipping()` with a real `Worker`: mock LLM/tool activities with `vi.fn()`, keep the persist/broadcast activities real, and stop long-lived workflows with `handle.terminate()` after `waitFor()` ([tests/helpers/wait.ts](tests/helpers/wait.ts)). See [src/temporal/legacy/workflow.test.ts](src/temporal/legacy/workflow.test.ts).
- **Activity tests** that use `Context.current()` run inside `MockActivityEnvironment` (see [classifier.test.ts](src/temporal/legacy/activities/classifier.test.ts)).

Temporal workflow test guidance: [.claude/rules/temporal-workflow-test.md](.claude/rules/temporal-workflow-test.md).

## Common Pitfalls

1. **Temporal workflows are deterministic** - no direct I/O, use activities for anything stateful
2. **Legacy workflow IDs need a numeric `chatId`** - `createWorkflowId` throws otherwise
3. **Activities need timeout configuration** - the default is too short for LLM calls
4. **Workflow code runs in an isolated V8 context** - it can only import activity _types_, not implementations or Node modules
5. **New workflows/activities must be exported from both `workflows.ts` and `activities.ts`**
6. **Client platform strings must match a registered `AgentResponseHandler` listener**

## Quick Reference

- Entry point: [src/hennos.ts](src/hennos.ts)
- Temporal worker: [src/worker.ts](src/worker.ts)
- Conversation workflow: [src/temporal/legacy/workflow.ts](src/temporal/legacy/workflow.ts)
- Tool list: [src/temporal/legacy/tools.ts](src/temporal/legacy/tools.ts)
- Provider resolution: [src/provider.ts](src/provider.ts)
- Schema: [prisma/schema.prisma](prisma/schema.prisma)
- Deployment: `docker compose up`
- Logs: Pino logger ([src/singletons/logger.ts](src/singletons/logger.ts)); the first argument is the workflowId or a component label
