import readline, { Interface } from "node:readline/promises";
import { Config } from "../../singletons/config";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUser } from "../../singletons/user";

export class CommandLineInstance {
    static async run(): Promise<void> {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            throw new Error("CommandLineInstance should not be used in production mode.");
        }

        // Create a temporary user account using the admin id
        const user = new HennosUser(Config.TELEGRAM_BOT_ADMIN);
        await user.setBasicInfo("Admin");
        await user.clearChatContext();

        const rl = await createInterface();

        let query = null;
        while (query !== "exit") {
            if (query) {
                const response = await handlePrivateMessage(user, query, {
                    role: "system",
                    content: "The user is sending their message via the command line interface in Hennos Development Mode, not via Telegram. " +
                        "Please call out anything that looks unusual or strange in the previous chat context, as it may be a bug."
                });

                console.log("\n\n=====\n" + response + "\n=====\n\n");
            }

            query = await rl.question("Input: ");
            if (query === "exit") {
                console.log("Exiting...");
                break;
            }

            if (query === "clear") {
                console.log("Clearing previous context...");
                await user.clearChatContext();
                query = null;
            }

            if (query === "anthropic") {
                console.log("Switching to Anthropic...");
                await user.setPreferredProvider("anthropic");
                query = null;
            }

            if (query === "openai") {
                console.log("Switching to OpenAI...");
                await user.setPreferredProvider("openai");
                query = null;
            }


            if (query === "ollama") {
                console.log("Switching to Ollama...");
                await user.setPreferredProvider("ollama");
                query = null;
            }
        }

        rl.close();

        process.exit(0);
    }
}

async function createInterface(): Promise<Interface> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            // @ts-expect-error - This is a valid input I swear
            input: process.stdin,
            output: process.stdout,
        });

        return resolve(rl);
    });

}