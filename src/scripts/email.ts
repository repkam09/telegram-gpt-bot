import { GmailInstance } from "../singletons/gmail";
import { Logger } from "../singletons/logger";

async function run() {
    await GmailInstance.init();

}

run().catch((err) => {
    Logger.error(undefined, `Error occurred: ${err.message}`);
    process.exit(1);
});