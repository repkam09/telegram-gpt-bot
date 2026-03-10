---
description: Instructions for writing Temporal Workflow code
applyTo: "**/src/temporal/**/workflow.ts"
---

# Temporal Workflow Development Guide (TypeScript)

## Official Documentation

- https://docs.temporal.io/develop/typescript
- https://typescript.temporal.io (API Reference)

## Core Principles

### Workflow Determinism

**CRITICAL**: Workflows run in a deterministic sandboxed V8 environment. All meaningful async operations MUST use Activities.

**Deterministic APIs Replaced:**

- `Date.now()` - Returns workflow time (only advances when workflow progresses)
- `Math.random()` - Replaced with deterministic version
- `setTimeout()` - Use `sleep()` from `@temporalio/workflow` instead

**Forbidden in Workflows:**

- Direct network calls (HTTP, database, etc.)
- File system access
- Non-deterministic operations
- Direct imports of Activity implementations (can import Activity _types_ only)
- Node.js or DOM APIs (unless in `ignoreModules` list and confirmed not used at runtime)
- `FinalizationRegistry` and `WeakRef` (removed - GC is non-deterministic)

### Workflow vs Activity Pattern

```typescript
// ✅ CORRECT: Activity for side effects
const { apiCall } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});
const data = await apiCall(); // Deterministic replay from Event History

// ❌ WRONG: Direct network call in workflow
const response = await fetch("https://api.example.com"); // NON-DETERMINISTIC!
```

## Workflow Structure

### Basic Workflow Pattern

```typescript
import { proxyActivities, sleep, condition } from "@temporalio/workflow";
import type * as activities from "../activities"; // Type import only!

// Proxy activities with timeout configuration
const { myActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
});

export async function myWorkflow(args: WorkflowArgs): Promise<WorkflowResult> {
  // Workflows are just functions that orchestrate Activities
  const result = await myActivity(args.data);
  await sleep("1 hour"); // Use sleep, not setTimeout
  return result;
}
```

### Parameter and Return Value Guidelines

- **Prefer single object parameters** over multiple args (allows adding fields without breaking signature)
- All parameters and return values must be **serializable**
- Payload size limits: 2MB per parameter, 4MB total gRPC message
- Everything is recorded in Event History - keep payloads small

```typescript
// ✅ GOOD: Single object parameter
interface WorkflowInput {
  userId: string;
  options?: ProcessingOptions;
}
export async function myWorkflow(input: WorkflowInput): Promise<Result>;

// ❌ AVOID: Multiple parameters (harder to extend)
export async function myWorkflow(
  userId: string,
  retryCount: number,
  flag: boolean,
);
```

## Message Passing (Signals, Queries, Updates)

### Defining Message Handlers

```typescript
import * as wf from "@temporalio/workflow";

// Define outside workflow for type safety and reusability
export const approveSignal = wf.defineSignal<[{ name: string }]>("approve");
export const statusQuery = wf.defineQuery<Status>("status");
export const updateSettings = wf.defineUpdate<Settings, [Settings]>(
  "updateSettings",
);

export async function myWorkflow(): Promise<void> {
  let approved = false;
  let settings: Settings = defaultSettings;

  // Signal: async, can mutate state, no return value
  wf.setHandler(approveSignal, ({ name }) => {
    approved = true;
    // Can be async to call activities
  });

  // Query: sync, read-only, must return value
  wf.setHandler(statusQuery, () => {
    return { approved, settings }; // Cannot be async!
  });

  // Update: async, can mutate state AND return value
  wf.setHandler(
    updateSettings,
    async (newSettings) => {
      // Can validate (throw to reject)
      if (!isValid(newSettings)) {
        throw new Error("Invalid settings");
      }
      const old = settings;
      settings = newSettings;
      return old; // Return value sent to client
    },
    {
      validator: (newSettings) => {
        // Optional validator runs before handler
        if (!newSettings.required) throw new Error("Missing required field");
      },
    },
  );

  await wf.condition(() => approved);
}
```

### Message Handler Rules

**Queries:**

- Must be **synchronous** (cannot use `async`)
- Cannot mutate workflow state
- No Activities, Timers, or async operations
- Can be sent to completed workflows (within retention period)

**Signals:**

- Can be **async**
- Can mutate state
- Cannot return values (fire-and-forget)
- Returns immediately to client (before handler executes)

**Updates:**

- Can be **async**
- Can mutate state AND return values
- Client waits for acceptance/rejection and optionally for result
- Use validators to reject before writing to Event History
- Safer than Signals for critical state changes (provides confirmation)

### Async Handler Safety

When using async Signal/Update handlers, be aware of **concurrent execution**:

```typescript
// ❌ DANGEROUS: Race condition
wf.setHandler(mySignal, async () => {
  const data = await fetchData();
  state.x = data.x;
  await sleep(100); // Another handler instance could run here!
  state.y = data.y; // May overwrite with mismatched data
});

// ✅ SAFE: Use mutex for critical sections
import { Mutex } from "async-mutex";
const lock = new Mutex();

wf.setHandler(mySignal, async () => {
  await lock.runExclusive(async () => {
    const data = await fetchData();
    state.x = data.x;
    await sleep(100);
    state.y = data.y; // Protected - no race condition
  });
});
```

### Wait for Handler Completion

```typescript
export async function myWorkflow(): Promise<Result> {
  // Set up async handlers...

  // Wait for all handlers to finish before completing/Continue-As-New
  await wf.condition(wf.allHandlersFinished);
  return result;
}
```

## Cancellation Scopes

Workflows are organized as a tree of cancellation scopes. Master this pattern for proper cleanup and timeout handling.

### Core Cancellation APIs

```typescript
import {
  CancellationScope,
  CancelledFailure,
  isCancellation,
} from "@temporalio/workflow";

// 1. Cancellable scope (default): cancellation propagates to children
await CancellationScope.cancellable(async () => {
  await longActivity(); // Will be cancelled if scope is cancelled
});

// 2. Non-cancellable scope: shields children from cancellation
await CancellationScope.nonCancellable(async () => {
  await cleanupActivity(); // Runs even if workflow is cancelled
});

// 3. Timeout scope: auto-cancels after duration
await CancellationScope.withTimeout("30 seconds", async () => {
  await maybeSlowActivity(); // Cancelled after 30s
});
```

### Cancellation Patterns

```typescript
// Pattern 1: Try/finally cleanup on cancellation
try {
  await CancellationScope.cancellable(async () => {
    await setupActivity();
    await mainActivity();
  });
} catch (err) {
  if (isCancellation(err)) {
    // Cleanup in non-cancellable scope
    await CancellationScope.nonCancellable(() => cleanupActivity());
  }
  throw err; // Re-throw to fail workflow
}

// Pattern 2: Race between operations
const scope = new CancellationScope();
const promise = scope.run(() => longOperation());
const result = await Promise.race([
  promise,
  scope.cancelRequested, // Resolves when cancellation requested
]);

// Pattern 3: Nested scopes for complex flows
await CancellationScope.cancellable(async () => {
  await CancellationScope.nonCancellable(() => setup());
  try {
    await CancellationScope.withTimeout("5 minutes", () => mainWork());
  } catch (err) {
    if (isCancellation(err)) {
      await CancellationScope.nonCancellable(() => cleanup());
    }
    throw err;
  }
});
```

## Activity Execution

### Activity Proxy Configuration

Activities MUST have timeout configuration. Use different timeouts for different operation types:

```typescript
// Quick database operations
const { saveUser, getUser } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 seconds",
  retry: { maximumAttempts: 5 },
});

// Long-running LLM/API calls
const { callLLM, processVideo } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

// Activities that need heartbeating
const { processLargeFile } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "10 seconds", // Activity must heartbeat every 10s
});
```

### Required Timeout

Every Activity proxy must specify either:

- `startToCloseTimeout` (most common), OR
- `scheduleToCloseTimeout`

### Dynamic Activity References

```typescript
const activities = proxyActivities<typeof activityModule>({
  /* options */
});

// All equivalent:
await activities.myActivity();
await activities["myActivity"]();

// Dynamic dispatch:
const activityName = determineActivity();
await activities[activityName](...args);
```

## Common Patterns

### Wait Conditions

```typescript
// Wait for Signal
let signalReceived = false;
wf.setHandler(mySignal, () => {
  signalReceived = true;
});
await wf.condition(() => signalReceived);

// Wait with timeout
const didComplete = await wf.condition(() => signalReceived, "1 hour");
if (!didComplete) {
  // Timed out
}

// Wait in handler for workflow readiness
wf.setHandler(myUpdate, async () => {
  await wf.condition(() => workflowIsReady);
  // Handler now safe to proceed
});
```

### External Workflow Signals

```typescript
import { getExternalWorkflowHandle } from "@temporalio/workflow";

export async function parentWorkflow() {
  const childHandle = getExternalWorkflowHandle("child-workflow-id");
  await childHandle.signal(someSignal, { data: "value" });
}
```

### Continue-As-New

```typescript
import { continueAsNew } from "@temporalio/workflow";

export async function loopingWorkflow(iteration: number): Promise<void> {
  // ... do work ...

  if (iteration < MAX_ITERATIONS) {
    // Avoid unlimited Event History growth
    await wf.condition(wf.allHandlersFinished); // Wait for handlers!
    await continueAsNew<typeof loopingWorkflow>(iteration + 1);
  }
}
```

**Critical**: Never use Continue-As-New from inside an Update handler. Complete all handlers before Continue-As-New.

## Workflow Type Customization

The Workflow Type is **automatically the function name** - there is no mechanism to customize it:

```typescript
export async function myWorkflow() {} // Workflow Type is "myWorkflow"
```

## Testing Best Practices

Use `TestWorkflowEnvironment` for workflow tests:

```typescript
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await TestWorkflowEnvironment.createTimeSkipping();
});

afterAll(async () => {
  await testEnv?.teardown();
});

test("my workflow", async () => {
  const { client } = testEnv;
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue: "test",
    workflowsPath: require.resolve("./workflows"),
  });

  const result = await worker.runUntil(
    client.workflow.execute(myWorkflow, {
      taskQueue: "test",
      workflowId: "test-id",
    }),
  );

  expect(result).toEqual(expectedValue);
});
```

## Critical Don'ts

❌ **Never** call Activity implementations directly in Workflow code
❌ **Never** use `setTimeout` or `setInterval` (use `sleep`)
❌ **Never** use `Date.now()` expecting real-time progression
❌ **Never** make network calls or file I/O from Workflows
❌ **Never** use Continue-As-New from Update handlers
❌ **Never** return values from Signal handlers
❌ **Never** use async in Query handlers
❌ **Never** forget timeout configuration for Activity proxies
❌ **Never** allow Workflows to complete with unfinished handlers (use `allHandlersFinished`)
❌ **Never** assume concurrent handler calls are safe (use Mutex when needed)

## Key Takeaways

1. **Workflows orchestrate, Activities execute**: Workflows are deterministic coordinators; all side effects go in Activities
2. **Workflow code runs multiple times**: Every time a Worker picks up a Workflow Task, workflow code replays from Event History
3. **Time in workflows is special**: `Date.now()` only advances when workflow state changes (awaiting activities, timers, etc.)
4. **Messages enable interaction**: Use Queries (read), Signals (write), and Updates (read-write) to interact with running workflows
5. **Cancellation is hierarchical**: Use scopes to control what gets cancelled and ensure cleanup
6. **Everything is persisted**: Keep payloads small - all params, return values, and state are in Event History
7. **Type safety is your friend**: Import Activity/Workflow types (not implementations) for compile-time safety
