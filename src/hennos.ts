import { Config } from "./singletons/config";
import * as handlers from "./handlers";
import { BotInstance } from "./singletons/telegram";
import { OpenAIWrapper } from "./singletons/openai";

async function start() {
    // Check that all the right environment variables are set
    Config.validate();

    // Create an OpenAI Instance
    OpenAIWrapper.instance();

    // Create a Telegram Bot Instance
    BotInstance.instance();

    // Attach the Telegram message handlers
    handlers.audio();
    handlers.contact();
    handlers.document();
    handlers.location();
    handlers.photos();
    handlers.text();
    handlers.voice();
    handlers.sticker();
}

// Kick off the async function
start();
