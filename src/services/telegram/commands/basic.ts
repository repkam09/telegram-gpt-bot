import { TelegramBotInstance } from "../telegram";
import { HennosUser } from "../../../singletons/user";

export async function handleStartCommand(user: HennosUser) {
    await TelegramBotInstance.sendMessageWrapper(user, `Hennos is a conversational chat assistant powered by a number of different large language models.

This bot contains additional features for approved users only. Limited access is availble to others. Your messages will be subject to moderation before being sent to the bot.

For more information type /help or check out the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`);
}

export async function handleHelpCommand(user: HennosUser) {
    await TelegramBotInstance.sendMessageWrapper(user, `Hennos is a conversational chat assistant powered by a number of different large language models.

This bot contains additional features for approved users only. Limited access is availble to others. Your messages will be subject to moderation before being sent to the bot.

Limited User Features:

- Basic text conversations with the bot.
- No chat memory is stored between messages.
- Messages are moderated for content policy violations.


Whitelisted User Features:

- Basic text conversations with the bot.
- Chat memory is stored allowing the bot to respond conversationally.
- Voice messages as both input and output.
- Image messages as input.
- GPS location based context (if the user sends a location, the bot will take that into account in future conversation).
- Customizable voice settings.
- Customizable language model provider settings, OpenAI, Anthropic or Local Models (Ollama).

Whitelisted users can try /settings to further customize the behavior of the bot.

For more information check out the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).
`);
}

export async function handleResetCommand(user: HennosUser) {
    await user.clearChatContext();
    await TelegramBotInstance.sendMessageWrapper(user, "Previous chat context has been cleared. The bot will not remember anything about your previous conversation.");
}
