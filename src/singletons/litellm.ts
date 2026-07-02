import { Config } from "./config";
import { HennosOpenAIProvider } from "./openai";

export class HennosLiteLLMSingleton {
    private static _instance: HennosOpenAIProvider | null = null;

    public static dynamic(): HennosOpenAIProvider {
        if (!HennosLiteLLMSingleton._instance) {
            HennosLiteLLMSingleton._instance = new HennosOpenAIProvider(Config.LITELLM_LLM, Config.LITELLM_BASE_URL, Config.LITELLM_API_KEY);
        }
        return HennosLiteLLMSingleton._instance;
    }
}