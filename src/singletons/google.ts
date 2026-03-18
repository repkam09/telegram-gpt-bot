import { Content, FunctionDeclaration, GoogleGenAI, Tool } from "@google/genai";
import { Config, HennosModelConfig } from "./config";
import { Logger } from "./logger";
import { HennosOpenAISingleton } from "./openai";
import { CompletionContextEntry, CompletionResponse, HennosInvokeResponse, HennosMessage, HennosTool } from "../provider";

export class HennosGoogleSingleton {
    private static _instance: HennosGoogleProvider | null = null;
    private static _mini: HennosGoogleProvider | null = null;

    public static high(): HennosGoogleProvider {
        if (!HennosGoogleSingleton._instance) {
            HennosGoogleSingleton._instance = new HennosGoogleProvider(Config.GOOGLE_LLM);
        }
        return HennosGoogleSingleton._instance;
    }

    public static low(): HennosGoogleProvider {
        if (!HennosGoogleSingleton._mini) {
            HennosGoogleSingleton._mini = new HennosGoogleProvider(Config.GOOGLE_MINI_LLM);
        }
        return HennosGoogleSingleton._mini;
    }
}

type GoogleCompletionResponse = GoogleCompletionResponseString | GoogleCompletionResponseTool;

type GoogleCompletionResponseString = {
    __type: "string";
    payload: string;
}

type GoogleCompletionResponseTool = {
    __type: "tool";
    payload: {
        name: string;
        input: string;
        id: string;
    }[];
}


class HennosGoogleProvider {
    public client: GoogleGenAI;
    private model: HennosModelConfig;

    constructor(model: HennosModelConfig) {
        this.model = model;
        this.client = new GoogleGenAI({
            apiKey: Config.GOOGLE_API_KEY,
        });
    }

    public limit(): number {
        return this.model.CTX;
    }

    public async invoke(workflowId: string, messages: HennosMessage[], tools?: HennosTool[]): Promise<HennosInvokeResponse> {
        Logger.info(workflowId, `Google Invoke Start (${this.model.MODEL})`);
        const converted = tools ? convertHennosTools(tools) : undefined;
        const prompt = convertHennosMessages(messages);

        const result = await this._completion(workflowId, prompt, converted);

        if (result.__type === "string") {
            Logger.info(workflowId, "OpenAI Invoke Success, Resulted in String Response");
            return {
                __type: "string",
                payload: result.payload
            };
        }

        if (result.__type === "tool") {
            return {
                __type: "tool",
                payload: result.payload.map((payload) => ({
                    name: payload.name,
                    input: payload.input,
                }))
            };
        }

        throw new Error("OpenAI Invoke Failed, Unhandled Response Type");
    }

    public async completion(workflowId: string, messages: CompletionContextEntry[], iterations: number, tools?: HennosTool[]): Promise<CompletionResponse> {
        Logger.debug(`Google Completion: Workflow ID: ${workflowId}, Messages: ${JSON.stringify(messages)}, Iterations: ${iterations}, Tools: ${JSON.stringify(tools)}`);
        throw new Error("Not Implemented");
    }

    public async moderation(workflowId: string, input: string): Promise<boolean> {
        Logger.warn(workflowId, "Google Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.high().moderation(workflowId, input);
    }

    private async _completion(workflowId: string, prompt: ConvertHennosMessageResponse, tools?: Tool[]): Promise<GoogleCompletionResponse> {
        Logger.debug(`Google _Completion: Workflow ID: ${workflowId}, Prompt: ${JSON.stringify(prompt)}, Tools: ${JSON.stringify(tools)}`);
        const chat = this.client.chats.create({
            model: this.model.MODEL,
            history: prompt.history,
            config: {
                systemInstruction: {
                    role: "system",
                    text: prompt.system.join("\n")
                },
                tools: tools
            }
        });

        let result = await chat.sendMessage({
            message: {
                text: prompt.next
            }
        });
    }
}


function convertHennosTools(tools: HennosTool[]): Tool[] {
    if (!tools) {
        return [{ functionDeclarations: [] }];
    }
    return [{
        functionDeclarations: tools.map((too) => ({
            name: too.function.name,
            description: too.function.description,
            parameters: too.function.parameters as FunctionDeclaration["parameters"],
        } satisfies FunctionDeclaration))
    }];
}

type ConvertHennosMessageResponse = {
    history: Content[],
    system: string[]
    next: string
}

type HennosTextMessage = { type: "text", role: "user" | "assistant" | "system", content: string };

function isHennosTextMessage(val: HennosMessage): val is HennosTextMessage {
    return val.type === "text";
}

function convertHennosMessages(messages: HennosMessage[]): ConvertHennosMessageResponse {
    const filtered = messages.filter((val) => isHennosTextMessage(val));

    const result = messages.reduce((acc, val, index) => {

        // Check that the content is valid
        if (val.content.trim() !== "") {
            // if this is the last message, set the next property
            if (index === filtered.length - 1) {
                acc.next = val.content;
                return acc;
            }

            if (val.role === "user") {
                acc.history.push({
                    role: "user",
                    parts: [{
                        text: val.content
                    }]
                });
            }

            if (val.role === "assistant") {
                acc.history.push({
                    role: "model",
                    parts: [{
                        text: val.content
                    }]
                });

            }

            if (val.role === "system") {
                acc.system.push(val.content);
            }
        }

        return acc;
    }, { history: [], system: [], next: "" } as ConvertHennosMessageResponse);

    // Try and make sure that the first message is always the user
    let first = result.history[0];
    while (first && first.role === "model") {
        result.history.shift();
        first = result.history[0];
    }

    return result;
}