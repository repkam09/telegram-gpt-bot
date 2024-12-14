import { Logger } from "./logger";
import { HennosBaseProvider, HennosConsumer } from "./base";
import { HennosUser } from "./user";
import { HennosMessage, HennosResponse } from "../types";

export class HennosMockSingleton {
    private static _instance: HennosBaseProvider | null = null;

    public static instance(): HennosBaseProvider {
        if (!HennosMockSingleton._instance) {
            HennosMockSingleton._instance = new HennosMockProvider();
        }
        return HennosMockSingleton._instance;
    }
}

class HennosMockProvider extends HennosBaseProvider {
    constructor() {
        super();
    }

    public details(): string {
        return "Mock Model";
    }

    public async completion(req: HennosConsumer, system: HennosMessage[], complete: HennosMessage[]): Promise<HennosResponse> {
        Logger.debug(req, "Mock Completion Start", system, complete);

        const last = complete[complete.length - 1];

        if (last.type === "text") {
            if (last.content.indexOf("empty") !== -1) {
                return {
                    __type: "empty"
                };
            }
        }


        return {
            __type: "string",
            payload: "This is a mock completion"
        };
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.debug(req, "Mock Moderation Start", input);
        return true;
    }

    public async transcription(req: HennosConsumer, file: string | Buffer): Promise<HennosResponse> {
        Logger.debug(req, "Mock Transcription Start", file);
        return {
            __type: "string",
            payload: "This is a mock transcription"
        };
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.debug(user, "Mock Speech Start", input);
        return {
            __type: "string",
            payload: "This is a mock speech response"
        };
    }
}
