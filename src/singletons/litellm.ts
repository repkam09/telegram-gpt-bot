import { Config, HennosModelConfig } from "./config";
import { HennosOpenAIProvider } from "./openai";
import { parseWorkflowId as parseLegacyWorkflowId } from "../temporal/legacy/interface";
import { Database } from "../database";

export class HennosLiteLLMSingleton {
    private static async resolveBringYourOwnKey(workflowId: string): Promise<string | null> {
        if (!Config.LITELLM_BYOK_ENABLED) {
            return null;
        }

        try {
            const parsed = parseLegacyWorkflowId(workflowId);
            const database = Database.instance();
            const userByok = await database.userBYOK.findUnique({
                where: {
                    chatId: Number(parsed.chatId)
                },
                select: {
                    key: true
                }
            });

            if (userByok && userByok.key) {
                return userByok.key;
            }
        } catch (error) {
            console.error("Error in HennosLiteLLMSingleton.resolveBringYourOwnKey:", error);
        }

        return null;
    }

    private static modelForTier(level: "high" | "low" | "nano"): HennosModelConfig {
        switch (level) {
            case "low":
                return Config.LITELLM_MINI_LLM;
            case "nano":
                return Config.LITELLM_NANO_LLM;
            default:
                return Config.LITELLM_LLM;
        }
    }

    private static async dynamic(workflowId: string, model: HennosModelConfig): Promise<HennosOpenAIProvider> {
        const apiKey = await this.resolveBringYourOwnKey(workflowId);
        if (apiKey) {
            return new HennosOpenAIProvider(model, Config.LITELLM_BASE_URL, apiKey, "LiteLLM-BYOK");
        }

        return new HennosOpenAIProvider(model, Config.LITELLM_BASE_URL, Config.LITELLM_API_KEY, "LiteLLM");
    }

    public static async high(workflowId: string): Promise<HennosOpenAIProvider> {
        return await this.dynamic(workflowId, Config.LITELLM_LLM);
    }

    public static async low(workflowId: string): Promise<HennosOpenAIProvider> {
        return await this.dynamic(workflowId, Config.LITELLM_MINI_LLM);
    }

    public static async nano(workflowId: string): Promise<HennosOpenAIProvider> {
        return await this.dynamic(workflowId, Config.LITELLM_NANO_LLM);
    }
}