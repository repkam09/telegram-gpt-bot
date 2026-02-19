import { Context } from "@temporalio/activity";
import { HennosOpenAISingleton } from "../../../singletons/openai";
import { BraveSearch } from "../../../tools/BraveSearch";
import { SearchWorkflowInput } from "../types";
import { temporalGrounding } from "../../../common/grounding";

export async function summarizeResults(input: SearchWorkflowInput, results: Array<object>): Promise<string | null> {
    const workflowId = Context.current().info.workflowExecution.workflowId;

    const promptTemplate = summarizePromptTemplate({
        query: input.query,
        results,
        currentDate: new Date(),
    });

    const instance = HennosOpenAISingleton.mini();
    const response = await instance.invoke(workflowId, [{ role: "user", content: promptTemplate, type: "text" }]);

    if (!response || response.__type !== "string") {
        return null;
    }

    return response.payload;
}

export async function searchResults(input: SearchWorkflowInput): Promise<Array<object>> {
    return BraveSearch.searchResults({ query: input.query, resource: "web" });
}

type SummarizePromptInput = {
    query: string,
    results: Array<object>,
    currentDate: Date,
}

function summarizePromptTemplate({ query, results, currentDate }: SummarizePromptInput): string {
    const { date, day } = temporalGrounding(currentDate);

    return `You are an expert search result summarizer. Your task is to read through the provided search results and generate a concise summary that highlights the most relevant information related to the user's query.
The current date is ${date}. It is a ${day} today. Return only the summary without any additional commentary. Use a few sentences to summarize the key points from the search results.

<search>
    <search-query>
        ${query}
    </search-query>
    <search-results>
        ${JSON.stringify(results)}
    </search-results>
</search>
`;
}