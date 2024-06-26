import { Message } from "ollama";
import { HennosGroup } from "./group";
import { HennosUser } from "./user";

export type HennosConsumer = HennosUser | HennosGroup

export abstract class HennosBaseProvider {
    public abstract completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<string>;
    public abstract vision(req: HennosConsumer, prompt: Message, remote: string, mime: string): Promise<string>;
    public abstract moderation(req: HennosConsumer, input: string): Promise<boolean>;
    public abstract transcription(req: HennosConsumer, path: string): Promise<string>;
    public abstract speech(user: HennosUser, input: string): Promise<ArrayBuffer>;
}