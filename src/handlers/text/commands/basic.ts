import TelegramBot from "node-telegram-bot-api";
import { resetMemory, sendMessageWrapper } from "../../../utils";

type MessageWithText = TelegramBot.Message & { text: string }

export async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

This bot contains additional features for approved users only. Limited access is availble to others.

For more information type /help or check out the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`);
}

export async function handleHelpCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

This bot contains additional features for approved users only. Limited access is availble to others.

Limited User Features:
- Basic text conversations with the bot.
- No chat memory is stored between messages.
- Messages are moderated for content policy violations.


Whitelisted User Features: 
- Basic text conversations with the bot.
- Full message history up to the context limit of the OpenAI API.
- Voice messages as both input and output.
- Image messages as input.
- GPS location based context (if the user sends a location, the bot will take that into account in future conversation).
- Customizable voice settings.
`);
}

export async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Previous chat context has been cleared. The bot will not remember anything about your previous conversation.");
}
