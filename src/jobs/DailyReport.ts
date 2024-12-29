
import { Logger } from "../singletons/logger";
import { HennosOpenAISingleton } from "../singletons/openai";
import { HennosUser } from "../singletons/user";
import { Job } from "./job";
import { buildPrompt } from "../handlers/text/private";
import { handleHennosResponse } from "../services/telegram/telegram";
import { Config } from "../singletons/config";

/**
 * This job will run every day at 8:00 AM EST and will send a daily report to the user with the following information:
 * - The weather forecast for the user's location, if available
 * - The top news headlines
 */
export class DailyReport extends Job {
    static schedule(): [string, string] {
        return ["0 8 * * *", "EST"];
    }

    static scheduled(user: HennosUser): void {
        Logger.info(user, "Scheduled Daily Report Job", DailyReport.schedule());
    }

    static async run(user: HennosUser) {
        Logger.info(user, `Starting Daily Report for ${user.displayName}`);

        const prompt = await buildPrompt(user);
        const context = await user.getChatContext();

        context.push(
            {
                role: "system",
                content: "The Hennos Daily Report is a scheduled task that runs every day and is triggered by this automated message. " +
                    "Please answer the following request to the best of your ability, making use of the information available to you via your own knowledge and available Tool calls.",
                type: "text"
            },
            {
                role: "user",
                content: "Could you please provide me with a few paragraphs of a daily brief that includes the weather, if my location is available, and the top news headlines for today?" +
                    "If there is any other potentially relevant information from our chat history, please remind me of that as well.",
                type: "text"
            }
        );

        const result = await HennosOpenAISingleton.instance().completion(user, prompt, context);

        Logger.debug(user, `Finished Daily Report for ${user.displayName}: \n ${result}`);

        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            await user.updateSystemChatContext("The Hennos Daily Report is a scheduled task that runs every day and is triggered by this automated message. " +
                "Please answer the following request to the best of your ability, making use of the information available to you via your own knowledge and available Tool calls.");

            await user.updateUserChatContext(user, "Could you please provide me with a few paragraphs of a daily brief that includes the weather, if my location is available, and the top news headlines for today?" +
                "If there is any other potentially relevant information from our chat history, please remind me of that as well.");

            await user.updateAssistantChatContext(result);
            return handleHennosResponse(user, result, {});
        }
    }
}
