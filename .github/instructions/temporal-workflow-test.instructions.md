---
description: Instructions for writing Temporal Workflow tests
applyTo: "**/src/temporal/**/workflow.test.ts"
---

# Instructions for Writing Temporal Workflow Tests

**Official Documentation**: https://docs.temporal.io/develop/typescript/testing-suite

## Overview

Write integration tests as the primary testing strategy. The test server supports time skipping, making it ideal for both end-to-end and integration tests with Workers.

## Test Framework Setup

### Installation

```bash
npm install @temporalio/testing
```

### Basic Test Structure (Jest/Vitest)

```typescript
import { TestWorkflowEnvironment } from "@temporalio/testing";

let testEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  testEnv = await TestWorkflowEnvironment.createTimeSkipping();
});

afterAll(async () => {
  await testEnv?.teardown();
});
```

**Important**: Use `testEnvironment: 'node'` in Jest config (not 'jsdom')

## Testing Workflows

### Mock Activities Pattern

When testing workflows, mock Activities by providing partial implementations:

```typescript
import type * as activities from "./activities";

const mockActivities: Partial<typeof activities> = {
  myActivity: async () => "mocked result",
};

const worker = await Worker.create({
  connection: testEnv.nativeConnection,
  taskQueue: "test",
  workflowsPath: require.resolve("./workflows"),
  activities: mockActivities,
});
```

### Time Skipping - Automatic (Recommended)

Use `.execute()` or `.result()` to automatically skip time when no Activities are running:

```typescript
test("sleep completes almost immediately", async () => {
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue: "test",
    workflowsPath: require.resolve("./workflows"),
  });

  // Does not wait the actual sleep duration
  await worker.runUntil(
    testEnv.client.workflow.execute(myWorkflow, {
      workflowId: uuid(),
      taskQueue: "test",
    }),
  );
});
```

### Time Skipping - Manual

Use `.start()` (not `.execute()`) and `testEnv.sleep()` for manual time control:

```typescript
test("test intermediate states", async () => {
  const handle = await testEnv.client.workflow.start(myWorkflow, {
    workflowId: uuid(),
    taskQueue: "test",
  });

  worker.run();

  let value = await handle.query(myQuery);
  expect(value).toBe(0);

  await testEnv.sleep("25 hours"); // Advance test server time
  value = await handle.query(myQuery);
  expect(value).toBe(1);
});
```

### Time Skipping in Activities

Call `testEnv.sleep()` from mock Activities to test workflow behavior during long-running operations:

```typescript
const mockActivities = {
  async processOrder() {
    await testEnv.sleep("2 days"); // Skip ahead while Activity runs
  },
  async sendEmail() {
    emailSent = true;
  },
};
```

### Working with worker.runUntil()

`worker.runUntil()` creates a Worker, runs it until the promise resolves, then shuts it down:

```typescript
const result = await worker.runUntil(
  testEnv.client.workflow.execute(myWorkflow, options),
);
expect(result).toEqual(expectedValue);
```

## Testing Activities

### Mock Activity Environment

Test Activities in isolation with `MockActivityEnvironment`:

```typescript
import { MockActivityEnvironment } from "@temporalio/testing";
import { activityInfo } from "@temporalio/activity";

const env = new MockActivityEnvironment({
  attempt: 2,
  // other optional Info fields
});

const result = await env.run(myActivity, arg1, arg2);
expect(result).toBe(expectedValue);
```

### Listen to Heartbeats

`MockActivityEnvironment` is an `EventEmitter`:

```typescript
const env = new MockActivityEnvironment();

env.on("heartbeat", (details: unknown) => {
  expect(details).toBe(expectedValue);
});

await env.run(myActivity);
```

### Test Cancellation

```typescript
env.on("heartbeat", (d: unknown) => {
  expect(d).toBe(6);
});

await expect(env.run(myActivity)).rejects.toThrow(CancelledFailure);
```

## Assertions in Workflows

Use the Node.js `assert` module, but prevent indefinite retries by using workflow interceptors:

```typescript
import {
  TestWorkflowEnvironment,
  workflowInterceptorModules,
} from "@temporalio/testing";

const worker = await Worker.create({
  connection: testEnv.nativeConnection,
  interceptors: {
    workflowModules: workflowInterceptorModules,
  },
  workflowsPath: require.resolve("./workflows"),
});

// Failed assertions will now fail the Workflow Execution, not just retry forever
```

## Testing Non-Workflow Functions in Workflow Context

To test a function that needs to run in the Workflow sandbox but isn't a Workflow itself:

```typescript
// Export the function from a workflow file
export async function functionToTest(): Promise<number> {
  await sleep("1 day");
  return 42;
}

// Execute it as if it were a Workflow
const worker = await Worker.create({
  workflowsPath: require.resolve("./file-with-function"),
});

const result = await worker.runUntil(
  testEnv.client.workflow.execute(functionToTest, options),
);
```

## Replay Testing (Critical for CI/CD)

Replay ensures Workflow changes are deterministic and compatible with existing executions.

### Single History Replay

```typescript
// From file
const history = JSON.parse(
  await fs.promises.readFile("./history.json", "utf8"),
);
await Worker.runReplayHistory(
  { workflowsPath: require.resolve("./workflows") },
  history,
);

// From server
const handle = client.workflow.getHandle("workflow-id");
const history = await handle.fetchHistory();
await Worker.runReplayHistory(
  { workflowsPath: require.resolve("./workflows") },
  history,
);
```

### Bulk Replay (Recommended for CI)

```typescript
const executions = client.workflow.list({
  query: 'TaskQueue=myQueue and StartTime > "2024-01-01T00:00:00"',
});

const histories = executions.intoHistories();
const results = Worker.runReplayHistories(
  { workflowsPath: require.resolve("./workflows") },
  histories,
);

for await (const result of results) {
  if (result.error) {
    console.error(
      "Replay failed for",
      result.execution.workflowId,
      result.error,
    );
    throw result.error; // Fail CI
  }
}
```

**Errors**:

- `DeterminismViolationError`: Workflow code is incompatible with history
- `ReplayError`: Other replay failures

## Best Practices

1. **Test Strategy**: Write mostly integration tests using `TestWorkflowEnvironment`
2. **Time Management**: Time is global per test env instance - run tests requiring different time behaviors in series or use separate test env instances
3. **Mock Activities**: Always mock Activities when testing Workflows to avoid external dependencies
4. **CI/CD**: Include replay testing in CI to catch breaking changes before deployment
5. **Test Scope**:
   - End-to-end: Full server + worker + client
   - Integration: Test server + worker with mocked Activities
   - Unit: Individual functions with mocked dependencies
