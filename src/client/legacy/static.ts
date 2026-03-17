export function getStartMessage(): string {
    return `Hennos is a conversational chat assistant powered by a number of different large language models.

Hennos is available to whitelisted users only. Your messages will be subject to moderation before being sent to the bot.

Hennos supports the following features for whitelisted users:
- Basic text conversations with the bot.
- Chat memory is stored allowing the bot to respond conversationally.
- Voice messages as input.
- Image messages as input.
- GPS location based context (if the user sends a location, the bot will take that into account in future conversation).

For more information check out the [GitHub repository](https://github.com/repkam09/telegram-gpt-bot).
`;
}

export function comingSoonMessage(): string {
    return "Hennos v2 has been released, some features are not yet implemented but will be coming soon!";
}