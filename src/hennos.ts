import { Config } from "./singletons/config";
import { Database } from "./singletons/sqlite";
import { init} from "./server";

async function start() {
    init();

    // Check that all the right environment variables are set
    Config.validate();

    // Create an OpenAI Instance
    // OpenAIWrapper.instance();

    await Database.init();
    // await Vector.init();
    
    // Create a Telegram Bot Instance
    // BotInstance.instance();

    // // Attach the Telegram message handlers
    // handlers.audio();
    // handlers.contact();
    // handlers.document();
    // handlers.location();
    // handlers.photos();
    // handlers.text();
    // handlers.voice();
    // handlers.sticker();
}

// Kick off the async function
start();
