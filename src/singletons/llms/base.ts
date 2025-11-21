import { HennosMessage, HennosResponse, HennosStringResponse, HennosTextMessage } from "../../types";
import { HennosConsumer } from "../consumer";

export abstract class HennosBaseProvider {
    public client: unknown;
    public tokenLimit: number = 0;
    public abstract invoke(req: HennosConsumer, messages: HennosTextMessage[]): Promise<HennosStringResponse>;
    public abstract completion(req: HennosConsumer, system: HennosTextMessage[], complete: HennosMessage[]): Promise<HennosResponse>;
    public abstract moderation(req: HennosConsumer, input: string): Promise<boolean>;
    public abstract transcription(req: HennosConsumer, path: string): Promise<HennosResponse>;
    public abstract speech(req: HennosConsumer, input: string): Promise<HennosResponse>;
    public abstract details(): string;
}