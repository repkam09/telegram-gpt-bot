import OpenAI from "openai";
import { HennosAgentResponse, HennosMessage, HennosResponse, HennosTextMessage } from "../../types";
import { HennosConsumer } from "../consumer";

export type InvokeToolOptions = [OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined, OpenAI.Chat.Completions.ChatCompletionTool[] | undefined, boolean | undefined];

export abstract class HennosBaseProvider {
    public client: unknown;
    public tokenLimit: number = 0;
    public abstract invoke(req: HennosConsumer, messages: HennosTextMessage[], tools: InvokeToolOptions): Promise<HennosAgentResponse>;
    public abstract completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse>;
    public abstract moderation(req: HennosConsumer, input: string): Promise<boolean>;
    public abstract transcription(req: HennosConsumer, path: string): Promise<HennosResponse>;
    public abstract speech(req: HennosConsumer, input: string): Promise<HennosResponse>;
    public abstract details(): string;
}