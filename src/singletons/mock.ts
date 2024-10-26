/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Message } from "ollama";
import { Logger } from "./logger";
import { HennosBaseProvider, HennosConsumer, HennosResponse } from "./base";
import { HennosUser } from "./user";

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

    public async completion(req: HennosConsumer, system: Message[], complete: Message[]): Promise<HennosResponse> {
        Logger.info(req, "Mock Completion Start", system, complete);
        if (complete.length === 0) {
            return {
                __type: "error",
                payload: "mock error response"
            };
        }

        const message = complete[0];
        if (message.content === "empty") {
            return {
                __type: "empty"
            };
        }

        if (message.content === "string") {
            return {
                __type: "string",
                payload: message.content
            };
        }

        return {
            __type: "string",
            payload: "mock response"
        };
    }

    public async moderation(req: HennosConsumer, input: string): Promise<boolean> {
        Logger.info(req, "Mock Moderation Start", input);
        return true;
    }

    public async transcription(req: HennosConsumer, path: string): Promise<HennosResponse> {
        Logger.info(req, "Mock Transcription Start", path);
        return {
            __type: "string",
            payload: "mock transcription"
        };
    }

    public async speech(user: HennosUser, input: string): Promise<HennosResponse> {
        Logger.info(user, "Mock Speech Start", input);
        return {
            __type: "string",
            payload: "mock speech"
        };
    }
}