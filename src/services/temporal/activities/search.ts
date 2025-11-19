import { HennosAnonUser } from "../../../singletons/consumer";
import { HennosOpenAISingleton } from "../../../singletons/llms/openai";
import { BraveSearch } from "../../../tools/BraveSearch";
import type { HennosTextMessage } from "../../../types";
import type { SearchWorkflowInput } from "../workflows";

export async function summarizeResults(input: SearchWorkflowInput, results: Array<object>): Promise<string> {
    // Call OpenAI to summarize the search results and return a summary string

    const prompt: HennosTextMessage = {
        type: "text",
        role: "system",
        content: `Summarize the following search results for the query: "${input.query}". Provide a concise summary highlighting the most relevant information.
Here are the search results:
<search-results>
${JSON.stringify(results, null, 2)}
</search-results>
Provide the summary below:
`,
    };

    const instance = HennosOpenAISingleton.mini();
    const req = await HennosAnonUser();
    const response = await instance.invoke(req, [prompt]);

    return response.payload;
}

export async function searchResults(input: SearchWorkflowInput): Promise<Array<object>> {
    return BraveSearch.searchResults({ query: input.query, resource: "web" });
}