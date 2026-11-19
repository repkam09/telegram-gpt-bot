import { Worker, WorkerOptions } from "@temporalio/worker";
import { WorkflowCoverage } from "@temporalio/nyc-test-coverage";

/**
 * Temporal runs workflow code in an isolated sandbox, outside the Vitest process, so normal coverage
 * tools cannot see it. @temporalio/nyc-test-coverage instruments the workflow bundle and exports the
 * counters from the sandbox; this helper merges them into the coverage Vitest collects.
 *
 * Requires coverage.provider "istanbul" (v8 coverage cannot be merged with instrumented counters).
 * Each test file gets its own module instance, so the shared WorkflowCoverage below is per test file.
 *
 * Usage in a workflow test:
 *   const worker = await createInstrumentedWorker({ connection, taskQueue, workflowsPath, activities });
 *   afterAll(() => mergeWorkflowCoverage());
 */
// Experiment: nyc/Jest define a host-side `__coverage__` global; Vitest's istanbul provider uses a different one.
(globalThis as unknown as { __coverage__?: object }).__coverage__ ??= {};

const workflowCoverage = new WorkflowCoverage();

export function createInstrumentedWorker(options: WorkerOptions & { workflowsPath: string }): Promise<Worker> {
    return Worker.create(workflowCoverage.augmentWorkerOptions(options));
}

type CoverageStore = Record<string, unknown>;

export function mergeWorkflowCoverage(): void {
    const scope = globalThis as unknown as { __coverage__?: CoverageStore; __VITEST_COVERAGE__?: CoverageStore };

    // mergeIntoGlobalCoverage() writes to the conventional nyc global, `__coverage__`. Vitest's istanbul
    // provider collects from its own global, so point the former at the latter for the merge.
    const store = (scope.__VITEST_COVERAGE__ ??= {});
    scope.__coverage__ = store;

    // TEMP DEBUG
    const before = Object.keys(store).length;
    const maps = (workflowCoverage as unknown as { coverageMapsData: unknown }).coverageMapsData;
    const list = Array.isArray(maps) ? maps : Array.from((maps as Map<unknown, unknown>)?.values?.() ?? []);
    console.log(`[wfcov] store before=${before}; coverageMapsData type=${Array.isArray(maps) ? "array" : typeof maps} count=${list.length}; first keys=${JSON.stringify(Object.keys((list[0] as object) ?? {}).slice(0, 5))}`);

    workflowCoverage.mergeIntoGlobalCoverage();

    // The merge can leave istanbul FileCoverage instances behind (their data lives under a `data` key), which
    // Vitest cannot read. Round-trip through JSON (FileCoverage.toJSON) to get plain coverage objects, and put
    // them back into the store Vitest collects from.
    const merged = JSON.parse(JSON.stringify(scope.__coverage__ ?? {})) as CoverageStore;
    for (const key of Object.keys(store)) {
        delete store[key];
    }
    Object.assign(store, merged);
    scope.__coverage__ = store;
    console.log(`[wfcov] store after=${Object.keys(store).length}; workflow entries=${Object.keys(store).filter((k) => k.endsWith("workflow.ts")).join(",")}`);
}
