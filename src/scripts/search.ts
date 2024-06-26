import { Config } from "../singletons/config";
import readline from "node:readline";
import axios from "axios";
import { convert } from "html-to-text";
import { HennosUser, HennosUserAsync } from "../singletons/user";
import { getHTMLSearchResults } from "../singletons/tools";
import { Message } from "ollama";
import { HennosOllamaSingleton } from "../singletons/ollama";

async function search(query: string) {
    const user = await HennosUserAsync(Config.TELEGRAM_BOT_ADMIN, "Test");

    const result = await HennosOllamaSingleton.instance().completion(user, buildQueryParsePrompt(), [{
        role: "user",
        content: query
    }]);

    let queries: string[] = [query];
    try {
        const parsed = JSON.parse(result);
        if (parsed.queries && Array.isArray(parsed.queries)) {
            queries = parsed.queries;
            console.log("Parsed queries: ", queries);
        }
    } catch (err) {
        console.error("Failed to parse queries from result. Result: ```", result, "```");
    }
    const promises = queries.map(async (q) => {
        let help: string;
        const json = await getSearchResults("https://api.duckduckgo.com/?format=json&q=" + q);
        if (json.AbstractText) {
            help = json.AbstractText;
        } else {
            const html = await getHTMLSearchResults("https://html.duckduckgo.com/html/?q=" + q);
            const converted = convert(html, {
                wordwrap: 130,
                selectors: [
                    { selector: "select", format: "skip" },
                    { selector: "option", format: "skip" },
                    { selector: "a", options: { ignoreHref: true } },
                    { selector: "img", format: "skip" }
                ]
            });

            const convertedLines = converted.split("\n\n\n");
            if (convertedLines.length > 5) {
                help = convertedLines.slice(0, 5).join("\n\n\n");
            } else {
                help = converted;
            }
        }
        return {
            term: q,
            result: help
        };
    });


    const context: { term: string, result: string }[] = [];
    const results = await Promise.all(promises);
    results.forEach((r) => {
        context.push(r);
    });

    const prompt = buildSearchResponsePrompt(user, query, context);

    console.log(prompt);

    const completion = await HennosOllamaSingleton.instance().completion(user, prompt, [{
        role: "user",
        content: query
    }]);
    console.log(completion);
}


async function getSearchResults(url: string) {
    const html = await axios({
        headers: {
            "User-Agent": "HennosBot/1.0"
        },
        method: "get",
        url: url,
        responseType: "json"
    });

    return html.data;
}

function buildQueryParsePrompt(): Message[] {
    const prompt: Message[] = [
        {
            role: "system",
            content: "You are an intelligent text processing AI that helps extract key information from user input."
        },
        {
            role: "system",
            content: "Your goal is to extract a few words from the user's input that are most relevant to their query."
        },
        {
            role: "system",
            content: "Your answer will be used to search the web for more context and information before providing a helpful response."
        },
        {
            role: "system",
            content: "Because your response will be parsed by code, you should format your response as a valid JSON object that contains a 'queries' key which is an array of strings. You should not include anything else in your response."
        }
    ];

    return prompt;
}

function buildSearchResponsePrompt(user: HennosUser, query: string, context: { term: string, result: string }[]): Message[] {
    const prompt: Message[] = [
        {
            role: "system",
            content: "You are a chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You should respond in short paragraphs, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are helping to answer a search query from a user for '${query}'.`
        },
        {
            role: "system",
            content: "To aid in your response, here are some search results from DuckDuckGo that might be helpful:"
        },
        {
            role: "system",
            content: context.map(c => `Search Term: ${c.term}:\nSearch Result: ${c.result}`).join("\n\n")
        },
        {
            role: "system",
            content: "Use your own knowledge, and the information from the search results, to provide a response to the user's question."
        }
    ];

    return prompt;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

console.log("Search DuckDuckGo");
rl.question("Query: ", query => {
    rl.close();
    search(query);
});

// Search for information about a topic that is much newer than the training data, probably.
// search("What can you tell me about LlamaIndex?");