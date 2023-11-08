import TelegramBot from "node-telegram-bot-api";
import { resetMemory, sendMessageWrapper } from "../../../utils";

type MessageWithText = TelegramBot.Message & { text: string }

export async function handleStartCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

    This bot is whitelisted for use by approved users only.
    Contact @repkam09 to request access!
    
    For more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`);
}

export async function handleHelpCommand(msg: MessageWithText) {
    await sendMessageWrapper(msg.chat.id, `Hennos is a conversational chat assistant powered by the OpenAI API using the GPT-4 language model, similar to ChatGPT.

    This bot is whitelisted for use by approved users only.
    Contact @repkam09 to request access!
    
    ## Looking for other ideas? 
    
    Try out voice messages in addition to text conversations, if you send a voice message Hennos will respond in both text and voice form.
    You can customize the voice that Hennos uses, along with other settings, with the /settings command. This voice is AI generated and provided via the OpenAI TTS service.
    
    If you send an image Hennos will give you a description of what you sent. If you want to ask a question based on an image, you can ask right in the caption field.
    
    You can send a GPS location and Hennos will take that into account in future conversation.

    For more information see the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).`);
}

export async function handleResetCommand(msg: MessageWithText) {
    await resetMemory(msg.chat.id);
    await sendMessageWrapper(msg.chat.id, "Previous chat context has been cleared. The bot will not remember anything about your previous conversation.");
}
