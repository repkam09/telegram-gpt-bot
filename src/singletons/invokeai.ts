import { HennosConsumer } from "./base";
import { Config } from "./config";
import { Logger } from "./logger";

export class InvokeAIProvider {
    public static status: boolean = false;

    static async health(): Promise<void> {
        if (!Config.INVOKE_API_ADDRESS) {
            Logger.debug(undefined, "INVOKE_API_ADDRESS address not set, skipping health check");
            InvokeAIProvider.status = false;
            return;
        }

        try {
            const response = await fetch(`${Config.INVOKE_API_ADDRESS}/api/v1/queue/default/list`);
            if (response.ok) {
                InvokeAIProvider.status = true;
            } else {
                InvokeAIProvider.status = false;
            }
        } catch (err: unknown) {
            Logger.error(undefined, "InvokeAIProvider error", err);
            InvokeAIProvider.status = false;
        }
    }

    static shouldUseInvokeAI(req: HennosConsumer): boolean {
        if (Config.INVOKE_API_ADDRESS && req.isAdmin() && InvokeAIProvider.status) {
            return true;
        }

        return false;
    }

    static async generateImage(req: HennosConsumer, prompt: string): Promise<Buffer> {
        throw new Error("InvokeAI image generation not implemented yet: " + prompt + req.toString());
    }
}