import { TelegramBotInstance } from "../telegram";
import { HennosConsumer } from "../../../singletons/base";

export async function handleStartCommand(req: HennosConsumer) {
    await TelegramBotInstance.sendMessageWrapper(req, `Hennos is a conversational chat assistant powered by a number of different large language models.

This bot contains additional features for approved users only. Limited access is availble to others. Your messages will be subject to moderation before being sent to the bot.

For more information type /help or check out the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`);
}

export async function handleHelpCommand(req: HennosConsumer) {
    await TelegramBotInstance.sendMessageWrapper(req, `Hennos is a conversational chat assistant powered by a number of different large language models.

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

export async function handleResetCommand(req: HennosConsumer) {
    await req.clearChatContext();
    await TelegramBotInstance.sendMessageWrapper(req, "Previous chat context has been cleared. The bot will not remember anything about your previous conversation.");
}
