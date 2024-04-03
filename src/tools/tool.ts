import OpenAI from "openai";
import { HennosUser } from "../singletons/user";
import { HennosGroup } from "../singletons/group";

export class HennosBaseTool {
    public static definition: OpenAI.Chat.Completions.ChatCompletionTool;
    private raw_arguments_json: string;

    constructor(raw_arguments_json: string) {
        if (!HennosBaseTool.definition) {
            throw new Error("Tool definition not set.");
        }

        this.raw_arguments_json = raw_arguments_json;
    }

    protected validate<T>(parsed_json: unknown): parsed_json is T {
        return true;
    }

    protected async callback<T>(req: HennosUser | HennosGroup, tool_id: string, parsed_json: T): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
        return {
            role: "tool",
            content: "Sorry, I was unable to process your request.",
            tool_call_id: tool_id
        };
    }
}