import Koa, { Context } from "koa";
import Router from "@koa/router";
import OpenAI from "openai";
import { processChatCompletionLimited } from "../../handlers/text/common";

interface KoaContext extends Context {
    request: KoaRequest;
}

interface KoaRequest extends Koa.Request {
    body: ChatRequestBody;
}

interface ChatRequestBody {
    message: string;
}

export function routes(router: Router) {
    router.post("/chat/:id", async (ctx: KoaContext): Promise<void> => {
        const { id } = ctx.params;
        const { message }: ChatRequestBody = ctx.request.body;

        const chatId = Number.parseInt(id);
        const result = await handlePrivateMessage(chatId, message);

        ctx.body = {
            id,
            result,
            error: false
        };
    });
}

async function handlePrivateMessage(chatId: number, message: string): Promise<string> {
    const first_name = "Mark";

    const prompt = await buildLimitedTierPrompt(chatId, first_name);
    const response = await processChatCompletionLimited(chatId, [
        ...prompt,
        {
            content: message,
            role: "user",
        }
    ]);

    return response;
}

function buildLimitedTierPrompt(chatId: number, name: string,): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const prompt: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: "You are a conversational chat assistant named 'Hennos' that is helpful, creative, clever, and friendly. You should respond in short sentences, using Markdown formatting, seperated with two newlines to keep your responses easily readable."
        },
        {
            role: "system",
            content: `You are currently assisting a user named '${name}' in a one-on-one private chat session.`
        },
        {
            role: "system",
            content: "This user is not whitelisted on the service and is getting basic, limited, tier access. Their message history will not be stored after this response."
        }
    ];

    return prompt;
}