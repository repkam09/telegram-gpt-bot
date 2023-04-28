import TelegramBot from "node-telegram-bot-api";

export function createMockMessage(type: TelegramBot.ChatType , merge: Partial<TelegramBot.Message> = {}): TelegramBot.Message {
    const msg: TelegramBot.Message = {
        chat: {
            id: -1,
            type: type
        },
        from: {
            first_name: "first_name",
            id: -1,
            is_bot: false
        },
        message_id: 0,
        date: 0
    };
    return Object.assign(msg, merge);
}
