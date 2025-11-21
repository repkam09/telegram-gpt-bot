import { temporalGrounding } from "../../../prompt";
import { HennosAnonUser } from "../../../singletons/consumer";
import { HennosOpenAISingleton } from "../../../singletons/llms/openai";
import { BraveSearch } from "../../../tools/BraveSearch";
import type { HennosTextMessage } from "../../../types";
import type { SearchWorkflowInput } from "../workflows";

export async function summarizeResults(input: SearchWorkflowInput, results: Array<object>): Promise<string | null> {
    // Call OpenAI to summarize the search results and return a summary string
    const { date, day } = temporalGrounding();

    const prompt: HennosTextMessage[] = [{
        type: "text",
        role: "system",
        content: [
            "You are an expert search result summarizer. Your task is to read through the provided search results and generate a concise summary that highlights the most relevant information related to the user's query.",
            `The current date is ${date}. It is a ${day} today. Return only the summary without any additional commentary. Use a few sentences to summarize the key points from the search results.`,
        ].join(" "),
    }, {
        type: "text",
        role: "user",
        content: [
            `<search><search-query>${input.query}</search-query><search-results>${JSON.stringify(results)}</search-results></search>`
        ].join(" "),
    }];

    const instance = HennosOpenAISingleton.mini();
    const req = await HennosAnonUser();
    const response = await instance.invoke(req, prompt);

    return response.payload;
}

export async function searchResults(input: SearchWorkflowInput): Promise<Array<object>> {
    return BraveSearch.searchResults({ query: input.query, resource: "web" });
}