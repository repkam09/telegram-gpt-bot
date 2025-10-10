import { proxyActivities } from "@temporalio/workflow";
import * as activities from "../../temporal/activities";

// Define the activities and options
const { fetchHennosUser, handleUserMessage } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minute",
});

type HennosChatInput = {
    userId: string;
    message: string;
}


export async function hennosChat(input: HennosChatInput): Promise<string> {
    const { userId, message } = input;

    const chatId = await fetchHennosUser(userId);
    return handleUserMessage(chatId, message);
}