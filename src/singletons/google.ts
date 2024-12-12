import { Content, FunctionDeclaration, FunctionDeclarationsTool, FunctionResponsePart, GoogleGenerativeAI, Part } from "@google/generative-ai";
import { Config } from "./config";
import { Logger } from "./logger";
import { getSizedChatContext } from "./context";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosOpenAISingleton } from "./openai";
import { HennosUser } from "./user";
import { HennosMessage, HennosResponse } from "../types";
import { availableTools, processToolCalls } from "../tools/tools";
import { Tool, ToolCall } from "ollama";
import { ToolCallMetadata } from "../tools/BaseTool";

export class HennosGoogleSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosGoogleSingleton._instance) {
            HennosGoogleSingleton._instance = new HennosGoogleProvider();
        }
        return HennosGoogleSingleton._instance;
    }
}

class HennosGoogleProvider extends HennosBaseProvider {
    private google: GoogleGenerativeAI;

    constructor() {
        super();

        this.google = new GoogleGenerativeAI(Config.GOOGLE_API_KEY);
    }

    public details(): string {
        return `Google Gemini model ${Config.GOOGLE_LLM.MODEL}`;
    }

    public async completion(req: HennosConsumer, system: HennosMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.info(req, `Google Completion Start (${Config.GOOGLE_LLM.MODEL})`);

        const chat = await getSizedChatContext(req, system, complete, Config.GOOGLE_LLM.CTX);
        const converted = convertHennosMessages(chat);

        if (!converted.next) {
            return {
                __type: "error",
                payload: "No text to generate"
            };
        }

        const parts: Part[] = system.reduce((acc, val) => {
            if (val.type === "text") {
                acc.push({
                    text: val.content
                });
            }
            return acc;
        }, [] as Part[]);

        const tools = availableTools(req);
        const convertedTools = convertToolCalls(tools);
        try {
            const model = this.google.getGenerativeModel({
                model: Config.GOOGLE_LLM.MODEL,
                tools: convertedTools
            });

            const chat = model.startChat({
                history: converted.history,
                systemInstruction: {
                    role: "system",
                    parts
                }
            });


            let result = await chat.sendMessage(converted.next);
            let calls = result.response.functionCalls();

            let maxIterations = 4;

            while (calls && calls.length > 0 && maxIterations > 0) {
                const tool_calls = calls.map((tool_call) => {
                    return [{
                        function: {
                            name: tool_call.name,
                            arguments: tool_call.args
                        }
                    }, { name: tool_call.name }] as [ToolCall, ToolCallMetadata];
                });

                const results = await processToolCalls(req, tool_calls);

                const shouldEmptyResponse = results.find(([, , type]) => type === "empty");
                if (shouldEmptyResponse) {
                    return {
                        __type: "empty"
                    };
                }

                const responses = results.map(([response, metadata]) => {
                    return {
                        functionResponse: {
                            name: metadata.name as string,
                            response: { result: response }
                        }
                    } satisfies FunctionResponsePart;
                });

                result = await chat.sendMessage(responses);
                calls = result.response.functionCalls();
                maxIterations--;
            }

            return {
                __type: "string",
                payload: result.response.text()
            };
        } catch (err: unknown) {
            Logger.info(req, "Google Completion Error: ", err, convertedTools, tools);
            return {
                __type: "error",
                payload: "Error generating text"
            };
        }
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.warn(req, "Google Moderation Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().moderation(req, input);
    }

    public async transcription(req: HennosConsumer, file: string | Buffer): Promise<HennosResponse> {
        Logger.warn(req, "Google Transcription Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().transcription(req, file);
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.warn(user, "Google Speech Start (OpenAI Fallback)");
        return HennosOpenAISingleton.instance().speech(user, input);
    }
}

type ConvertHennosMessageResponse = {
    history: Content[],
    next: string | null
}

function convertHennosMessages(messages: HennosMessage[]): ConvertHennosMessageResponse {
    const filtered = messages.filter((val) => isHennosTextMessage(val));
    const result = filtered.reduce((acc, val, index) => {

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
        }

        return acc;
    }, { history: [], next: null } as ConvertHennosMessageResponse);

    // Try and make sure that the first message is always the user
    let first = result.history[0];
    while (first && first.role === "model") {
        result.history.shift();
        first = result.history[0];
    }
    return result;
}

function convertToolCalls(tools: Tool[] | undefined): FunctionDeclarationsTool[] {
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

type HennosTextNonSystemMessage = { type: "text", role: "user" | "assistant", content: string };
function isHennosTextMessage(val: HennosMessage): val is HennosTextNonSystemMessage {
    return val.type === "text" && val.role !== "system";
}