
import { Logger } from "../singletons/logger";
import { HennosOpenAISingleton } from "../singletons/openai";
import { HennosUser } from "../singletons/user";
import { open_weathermap_lookup_tool_callback } from "../tools/open_weather_map_lookup";
import { Job } from "./job";
import { buildPrompt } from "../handlers/text/private";
import { top_news_stories_tool_callback } from "../tools/the_news_api";
import { BotInstance } from "../singletons/telegram";
import { Config } from "../singletons/config";

/**
 * This job will run every day at 8:00 AM and will send a daily report to the user with the following information:
 * - The weather forecast for the user's location, if available
 * - The top news headlines
 */
export class DailyReport extends Job {
    static schedule(): string {
        return "0 8 * * *";
    }

    static async run(user: HennosUser) {
        Logger.info(user, `Starting Daily Report for ${user.displayName}`);

        // Get the user's location
        const info = await user.getBasicInfo();

        let weather;
        if (info.location) {
            const result = await open_weathermap_lookup_tool_callback(user, {
                name: "open_weather_map_lookup",
                args: {
                    lat: String(info.location.latitude),
                    lon: String(info.location.longitude)
                }
            });
            if (result) {
                weather = `Fetched weather information for lat: ${info.location.latitude}, lon: ${info.location.longitude} with the following data: ${JSON.stringify(result)}`;
            } else {
                weather = "Unable to fetch weather information for this user. Something went wrong while trying to fetch the weather at this time.";
            }
        } else {
            weather = "Unable to fetch weather information for this user. They have not provided their location. They can do this by sending a GPS pin via Telegram.";
        }

        const news = await top_news_stories_tool_callback(user, {
            name: "top_news_stories",
            args: {}
        });


        // Summarize the information into a nice daily report for the user
        const prompt = await buildPrompt(user);
        const context = await user.getChatContext();

        // Append the weather information to the context
        context.push(
            {
                role: "system",
                content: "The Hennos Daily Report is a scheduled task that runs every day around 8:00 AM. This is an automated messages that is sent to you every day around this time. You should be friendly, as usual, and wish the user a good morning."
            },
            {
                role: "user",
                content: "Could you please provide me with the daily report of the weather, news headlines, and any other time dependant information from our chat history if applicable?"
            },
            {
                role: "system",
                content: `Daily Report Weather Information: ${weather}`
            },
            {
                role: "system",
                content: `Daily Report News Headlines: ${JSON.stringify(news)}`
            }
        );

        const result = await HennosOpenAISingleton.instance().completion(user, prompt, context);

        Logger.debug(`Finished Daily Report for ${user.displayName}: \n ${result}`);

        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            await user.updateChatContext("system", "The Hennos Daily Report is a scheduled task that runs every day around 8:00 AM. This is an automated messages that is sent to you every day around this time. You should be friendly, as usual, and wish the user a good morning.");
            await user.updateChatContext("user", "Could you please provide me with the daily report of the weather, news headlines, and any other time dependant information from our chat history if applicable?");
            await user.updateChatContext("assistant", result);

            BotInstance.sendTelegramMessageWithRetry(user, result, {});
        }
    }
}
