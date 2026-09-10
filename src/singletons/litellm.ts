import { Config } from "./config";
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

    public static async dynamic(workflowId: string): Promise<HennosOpenAIProvider> {
        const apiKey = await this.resolveBringYourOwnKey(workflowId);
        if (apiKey) {
            return new HennosOpenAIProvider(Config.LITELLM_LLM, Config.LITELLM_BASE_URL, apiKey, "LiteLLM-BYOK");
        }

        return new HennosOpenAIProvider(Config.LITELLM_LLM, Config.LITELLM_BASE_URL, Config.LITELLM_API_KEY, "LiteLLM");
    }
}