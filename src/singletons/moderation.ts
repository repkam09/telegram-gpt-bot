import { Logger } from "./logger";
import { OpenAIWrapper } from "./openai";
import { HennosUser } from "./user";

export async function moderateLimitedUserTextInput(user: HennosUser, text: string): Promise<boolean> {
    Logger.info(user, "moderateLimitedUserTextInput Start (moderation)");

    try {
        const response = await OpenAIWrapper.instance().moderations.create({
            input: text
        });

        if (!response.results) {
            return false;
        }

        if (!response.results[0]) {
            return false;
        }

        Logger.info(user, `moderateLimitedUserTextInput End, Result: ${response.results[0].flagged}`);
        return response.results[0].flagged;
    } catch (err) {
        Logger.info(user, `moderateLimitedUserTextInput End, Error ${err}`);
        return false;
    }
}
