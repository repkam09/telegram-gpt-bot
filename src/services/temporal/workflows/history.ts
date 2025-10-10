import { proxyActivities } from "@temporalio/workflow";
import * as activities from "../../temporal/activities";
import OpenAI from "openai";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// Define the activities and options
const { fetchUserHistory, fetchHennosUser } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minute",
});

export async function hennosFetchHistory(supabaseId: string): Promise<Message[]> {
    const chatId = await fetchHennosUser(supabaseId);
    const history = await fetchUserHistory(chatId);
    return history;
}
