import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities";


export type SearchWorkflowInput = {
    query: string
}

export type SearchWorkflowOutput = {
    results: Array<object>
    summary: string
}

const { searchResults, summarizeResults } = proxyActivities<typeof activities>({
    startToCloseTimeout: "15 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

export async function searchWorkflow(input: SearchWorkflowInput): Promise<SearchWorkflowOutput> {
    const results = await searchResults(input);
    const summary = await summarizeResults(input, results);

    return { results, summary };
}