import Koa, { Context } from "koa";
import Router from "@koa/router";
import { processChatCompletion, updateChatContext } from "../../handlers/text/common";
import { buildPrompt } from "../../handlers/text/private";
import { Database } from "../../singletons/sqlite";

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
    const db = Database.instance();
    const user = await db.user.findUniqueOrThrow({ where: { chatId: chatId } });

    const prompt = await buildPrompt(chatId, user.firstName);
    const context = await updateChatContext(chatId, "user", message);
    const response = await processChatCompletion(chatId, [
        ...prompt,
        ...context
    ]);
    await updateChatContext(chatId, "assistant", response);
    return response;
}
