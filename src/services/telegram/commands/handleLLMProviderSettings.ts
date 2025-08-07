import TelegramBot from "node-telegram-bot-api";
import { TelegramBotInstance } from "../telegram";
import { Logger } from "../../../singletons/logger";
import { HennosUser } from "../../../singletons/user";
import { ValidLLMProvider, ValidLLMProviders } from "../../../types";
import { Config } from "../../../singletons/config";

export async function handleLLMProviderSettingsCallback(user: HennosUser, queryId: string, data: string) {
    const provider = data.replace("llm-settings-", "").trim();

    const bot = TelegramBotInstance.instance();
    user.setPreferredProvider(provider as ValidLLMProvider).then(() => {
        bot.answerCallbackQuery(queryId, {
            text: "Future messages will be powered by " + provider + "."
        });
        Logger.trace(user, `update_provider: ${provider}`);
        bot.sendMessage(user.chatId, "Future messages will be powered by " + provider + ".");
    }).catch((err: unknown) => {
        Logger.error(user, "Error while updating AI provider settings", err);
        bot.answerCallbackQuery(queryId, {
            text: "There was an error while updating your AI provider settings"
        });
        Logger.trace(user, "update_provider_error");
        bot.sendMessage(user.chatId, "There was an error while updating your AI provider settings");
    });
}

export async function sendLLMProviderSettingsPrompt(user: HennosUser) {
    const opts: TelegramBot.SendMessageOptions = {
        reply_markup: {
            resize_keyboard: true,
            one_time_keyboard: true,
            inline_keyboard: [
                [
                    {
                        text: "Anthropic",
                        callback_data: "llm-settings-anthropic",
                    },
                    {
                        text: "OpenAI",
                        callback_data: "llm-settings-openai",
                    },
                    {
                        text: "Ollama",
                        callback_data: "llm-settings-ollama",
                    },
                ]
            ]
        }
    };

    const bot = TelegramBotInstance.instance();
    bot.sendMessage(user.chatId, `Hennos supports several different model providers.
        
Anthropic and OpenAI are cloud-based providers that offer powerful frontier models. Both are fast, intelligent, and capable of handling a wide range of tasks. 
Ollama is a local model provider that will run all queries on the Hennos server itself, and is a great option if you want to keep all data local and private. However, these models will be slower and less capable than the cloud-based options.

Ollama is configured to use ${Config.OLLAMA_LLM.MODEL}.
OpenAI is configured to use ${Config.OPENAI_LLM.MODEL}.
Anthropic is configured to use ${Config.ANTHROPIC_LLM.MODEL}.

Select one of the options below: `, opts);
}

export async function handleAdminSetProviderCommand(user: HennosUser, text: string) {
    const trimmed = text.replace("/llm-provider", "").trim();
    const bot = TelegramBotInstance.instance();

    if (trimmed) {
        const parts = trimmed.split(" ");
        const input = parseInt(parts[0]);
        if (isNaN(input)) {
            return bot.sendMessage(user.chatId, "The chatId you tried to configure appears to be invalid. Expected an integer value.");
        }

        // Check if we have a user with that chatId.
        const exists = await HennosUser.exists(input);
        if (!exists) {
            return bot.sendMessage(user.chatId, `ChatId ${input} is not a known user.`);
        }

        if (parts[1]) {
            // Grab the provider name
            if (!ValidLLMProviders.includes(parts[1] as ValidLLMProvider)) {
                return bot.sendMessage(user.chatId, `ChatId ${input} is a known user, but requested provider ${parts[1]} is invalid.`);
            }

            await exists.setPreferredProvider(parts[1] as ValidLLMProvider);
            return bot.sendMessage(user.chatId, `ChatId ${input} has been configured to use ${parts[1]}.`);
        } else {
            return bot.sendMessage(user.chatId, `ChatId ${input} has been configured to use ${exists.provider}.`);
        }
    } else {
        return bot.sendMessage(user.chatId, `You are configured to use ${user.provider}.`);
    }
}


