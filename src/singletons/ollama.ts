import { Config } from "./config";
import { Message, Ollama } from "ollama";
import { Logger } from "./logger";
import { HennosOpenAISingleton } from "./openai";
import { HennosInvokeResponse, HennosMessage, HennosTool } from "../provider";

export class HennosOllamaSingleton {
    private static _instance: HennosOllamaProvider | null = null;

    public static instance(): HennosOllamaProvider {
        if (!HennosOllamaSingleton._instance) {
            HennosOllamaSingleton._instance = new HennosOllamaProvider();
        }
        return HennosOllamaSingleton._instance;
    }
}

export class HennosOllamaProvider {
    public client: Ollama;
    constructor() {
        this.client = new Ollama({
            host: `${Config.OLLAMA_HOST}:${Config.OLLAMA_PORT}`
        });
    }

    public async invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse> {
        Logger.info(workflowId, `Ollama Invoke Start (${Config.OLLAMA_LLM.MODEL})`);
        const prompt = convertHennosMessages(messages);
        return this._invoke(workflowId, prompt, tools);
    }

    private async _invoke(workflowId: string, prompt: Message[], tools?: HennosTool[]): Promise<HennosInvokeResponse> {
        const response = await this.client.chat({
            stream: false,
            model: Config.OLLAMA_LLM.MODEL,
            messages: prompt,
            tools: tools
        });

        Logger.info(workflowId, `Ollama Invoke Success, Usage: ${response.eval_count}`);
        // If we're using a thinking model, we might get back thoughts within <think> ... </think> tags.
        // We should strip these out before returning to the user. Find the index of the first </think> tag and strip everything before it.

        const thinkingBlock = response.message.content.indexOf("</think>");
        if (thinkingBlock !== -1) {
            const cleaned = response.message.content.substring(thinkingBlock + 8).trim();
            Logger.info(workflowId, "Ollama Completion Success, Stripped Thinking Tags");
            return {
                __type: "string",
                payload: cleaned
            };
        }

        if (response.message.tool_calls && response.message.tool_calls.length > 0) {
            Logger.info(workflowId, "Ollama Completion Success, Resulted in Tool Call");
            const toolCall = response.message.tool_calls[0];
            return {
                __type: "tool",
                payload: {
                    uuid: toolCall.function.name,
                    name: toolCall.function.name,
                    input: toolCall.function.arguments ? JSON.stringify(toolCall.function.arguments) : ""
                }
            };
        }

        Logger.info(workflowId, "Ollama Completion Success, Resulted in Text Completion");
        return {
            __type: "string",
            payload: response.message.content
        };
    }

    public async moderation(workflowId: string, input: string): Promise<boolean> {
        Logger.info(workflowId, "Ollama Moderation Start");
        return HennosOpenAISingleton.instance().moderation(workflowId, input);
    }
}

function convertHennosMessages(messages: HennosMessage[]): Message[] {
    return messages.reduce((acc, val) => {
        if (val.type === "text") {
            acc.push({
                role: val.role,
                content: val.content
            });
        }
        return acc;
    }, [] as Message[]);
}