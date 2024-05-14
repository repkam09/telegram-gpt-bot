import OpenAI from "openai";
import { HennosUser } from "../singletons/user";
import { HennosGroup } from "../singletons/group";

export abstract class HennosBaseTool {
    public static definition: OpenAI.Chat.Completions.ChatCompletionTool;
    public abstract validate(parsed_json: unknown): boolean
    public abstract process(req: HennosUser | HennosGroup, tool_id: string): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam>;
}