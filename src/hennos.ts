import { Config } from "./singletons/config";
import * as handlers from "./handlers";
import { BotInstance } from "./singletons/telegram";
import { OpenAI } from "./singletons/openai";
import { RedisCache } from "./singletons/redis";
import { Functions } from "./singletons/functions";
import { Schedule } from "./singletons/schedule";
import { jellyfin, reminders, weather, youtube, rss_feed } from "./providers";
import { Logger } from "./singletons/logger";

async function start() {
    // Check that all the right environment variables are set
    Config.validate();

    // Create an OpenAI Instance
    OpenAI.instance();
        
    const models = await OpenAI.models();
    const ids = models.data.map((entry) => entry.id);
    models.data.forEach((model) => model.id);
    Logger.info("Available Models:", JSON.stringify(ids));

    const model = Config.OPENAI_API_LLM;
    if (!ids.includes(model)) {
        Logger.error(`Configured Model ${model} is not available`);
        process.exit(1);
    }

    const data = await OpenAI.model(model);
    Logger.info("Configured Model:", JSON.stringify(data));


    if (Config.USE_PERSISTANT_CACHE) {
        await RedisCache.init();
    }


    // Crate the Functions instance
    Functions.instance();

    // Create a Telegram Bot Instance
    BotInstance.instance();

    // Create a Schedule Instance
    Schedule.instance();

    // Attach the Telegram message handlers
    handlers.audio();
    handlers.contact();
    handlers.document();
    handlers.location();
    handlers.photos();
    handlers.text();
    handlers.voice();
    handlers.sticker();
    handlers.api();

    // Load functions
    // jellyfin();
    // reminders();
    // weather();
    // youtube();
    // await rss_feed();
}

// Kick off the async function
start();
