import TelegramBot from "node-telegram-bot-api";
import { TelegramBotInstance } from "../telegram";
import { Logger } from "../../../singletons/logger";
import { HennosUser } from "../../../singletons/user";

export async function handleLLMProviderSettingsCallback(user: HennosUser, queryId: string, data: string) {
    const provider = data.replace("llm-settings-", "").trim();

    const bot = TelegramBotInstance.instance();
    user.setPreferredProvider(provider).then(() => {
        bot.answerCallbackQuery(queryId, {
            text: "Future messages will be powered by " + provider + "."
        });
        bot.sendMessage(user.chatId, "Future messages will be powered by " + provider + ".");
    }).catch((err: unknown) => {
        Logger.error(user, "Error while updating AI provider settings", err);
        bot.answerCallbackQuery(queryId, {
            text: "There was an error while updating your AI provider settings"
        });
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
                        text: "Anthropic Claude",
                        callback_data: "llm-settings-anthropic",
                    },
                    {
                        text: "OpenAI GPT-4",
                        callback_data: "llm-settings-openai",
                    },
                    {
                        text: "Ollama Models",
                        callback_data: "llm-settings-ollama",
                    },
                ]
            ]
        }
    };

    const bot = TelegramBotInstance.instance();
    bot.sendMessage(user.chatId, `You can customize the AI model that Hennos uses when responding to messages.
        
Anthropic provides Claude, a highly performant, trustworthy, and intelligent AI platform. Claude excels at tasks involving language, reasoning, analysis, coding, and more. You can learn more about Claude at https://www.anthropic.com/claude.

OpenAI provides GPT-4. GPT-4 can solve difficult problems with greater accuracy, thanks to its broader general knowledge and problem solving abilities. You can learn more about GPT-4 at https://openai.com/index/gpt-4/

Ollama provides completely private, locally hosted, models that keep all of your data and conversations directly on the Hennos server and does not rely on any external providers. It may not be as fast or intelligent as the other options.

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
            const validProviders = ["openai", "anthropic", "ollama"];
            if (!validProviders.includes(parts[1])) {
                return bot.sendMessage(user.chatId, `ChatId ${input} is a known user, but requested provider ${parts[1]} is invalid.`);
            }

            await exists.setPreferredProvider(parts[1]);
            return bot.sendMessage(user.chatId, `ChatId ${input} has been configured to use ${parts[1]}.`);
        } else {
            const current = await exists.getPreferences();
            return bot.sendMessage(user.chatId, `ChatId ${input} has been configured to use ${current.provider}.`);
        }
    } else {
        const preferences = await user.getPreferences();
        return bot.sendMessage(user.chatId, `You are configured to use ${preferences.provider}.`);
    }
}


