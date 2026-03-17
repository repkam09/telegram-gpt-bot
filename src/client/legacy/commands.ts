import TelegramBot from "node-telegram-bot-api";
import { AgentResponseHandler } from "../../response";
import { comingSoonMessage, getStartMessage } from "./static";

export async function handleCommand(workflowId: string, author: string, msg: TelegramBot.Message): Promise<void> {
    if (!msg.from || !msg.text) {
        return;
    }

    if (msg.text === "/reset") {
        // TODO: This command needs to clear the messages from the users database entries
        return AgentResponseHandler.handleMessage(workflowId, comingSoonMessage());
    }

    if (msg.text === "/start") {
        return AgentResponseHandler.handleMessage(workflowId, getStartMessage());
    }

    if (msg.text === "/help" || msg.text === "/about") {
        return AgentResponseHandler.handleMessage(workflowId, getStartMessage());
    }

    if (msg.text === "/settings") {
        return AgentResponseHandler.handleMessage(workflowId, comingSoonMessage());
    }

    return AgentResponseHandler.handleMessage(workflowId, `Unknown Command: ${msg.text}`);
}