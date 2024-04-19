import { Config } from "../singletons/config";
import { processChatCompletionLocal } from "../singletons/completions";
import OpenAI from "openai";
import { HennosUser } from "../singletons/user";
import { getHTMLSearchResults } from "../singletons/tools";
import { getChatContextTokenCount } from "../singletons/context";
import { convert } from "html-to-text";

async function browse(url: string) {
    const user = new HennosUser(Config.TELEGRAM_BOT_ADMIN);

    const html = await getHTMLSearchResults(url);

    const converted = convert(html, {
        wordwrap: 130,
        selectors: [
            { selector: "select", format: "skip" },
            { selector: "option", format: "skip" },
            { selector: "a", options: { ignoreHref: true } },
            { selector: "img", format: "skip" }
        ]
    });

    const prompt = buildSearchResponsePrompt(user, url, converted);

    // Calculate tiktoken
    const tokens = getChatContextTokenCount(prompt);

    console.log(prompt, tokens);

    const completion = await processChatCompletionLocal(user, prompt);
    console.log(completion);
}

function buildSearchResponsePrompt(user: HennosUser, url: string, text: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: `The following text has been extracted from the webpage ${url}. Use it, if relevant, to answer the users question. Here is the page content:\n ${text} `
        },
        {
            role: "user",
            content: "What are some of the features of the new release?"
        }
    ];

    return prompt;
}

// Search for information about a topic that is much newer than the training data, probably.
browse("https://lists.ubuntu.com/archives/ubuntu-announce/2024-April/000300.html");