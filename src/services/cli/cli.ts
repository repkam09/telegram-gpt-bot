import readline from "node:readline/promises";
import { Config } from "../../singletons/config";
import { handlePrivateMessage } from "../../handlers/text/private";
import { HennosUser } from "../../singletons/user";

export class CommandLineInstance {
    static async run(): Promise<void> {
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            throw new Error("CommandLineInstance should not be used in production mode.");
        }

        const user = await HennosUser.exists(Config.TELEGRAM_BOT_ADMIN);
        if (!user) {
            throw new Error("Existing admin user account not found");
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        let query = null;
        while (query !== "exit") {
            if (query) {
                const response = await handlePrivateMessage(user, query, {
                    role: "system",
                    content: "The user is sending their messsage via the command line interface in Hennos Development Mode. " +
                        "Please call out anything that looks unusual or strange in the previous chat context, as it may be a bug.",
                    type: "text"
                });

                if (response.__type === "string") {
                    console.log("\n\n=====\n" + response.payload + "\n=====\n\n");
                }

                if (response.__type === "error") {
                    console.error("\n\n=====\n" + response.payload + "\n=====\n\n");
                }

                if (response.__type === "arraybuffer") {
                    console.log("\n\n=====\n <arrayBuffer> \n=====\n\n");
                }

                if (response.__type === "empty") {
                    console.log("\n\n=====\n <empty> \n=====\n\n");
                }
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

            if (query === "google") {
                console.log("Switching to Google...");
                await user.setPreferredProvider("google");
                query = null;
            }

            if (query === "mistral") {
                console.log("Switching to Mistral...");
                await user.setPreferredProvider("mistral");
                query = null;
            }

            if (query === "mock") {
                console.log("Switching to Mock...");
                await user.setPreferredProvider("mock");
                query = null;
            }
        }

        rl.close();

        process.exit(0);
    }
}