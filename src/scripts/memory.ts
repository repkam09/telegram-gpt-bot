/**
 * Dev helper for reviewing the nightly memory extraction.
 *
 *   npm run script:memory -- dump <chatId>    print every memory file for a chat
 *   npm run script:memory -- run <chatId>     run the gate + extraction for one chat now (writes memory and moves the watermark)
 *   npm run script:memory -- state <chatId>   print the chat's extraction watermark
 */
import { Database } from "../database";
import { MemoryFileStore } from "../tools/memory/MemoryFileStore";
import { processChat } from "../temporal/memory/process";
import { getWatermark } from "../temporal/memory/state";

async function run() {
    const [command, chatId] = process.argv.slice(2);
    if (!command || !chatId || Number.isNaN(Number(chatId))) {
        console.error("Usage: npm run script:memory -- <dump|run|state> <chatId>");
        process.exit(1);
    }

    await Database.init();

    try {
        if (command === "dump") {
            const store = new MemoryFileStore(chatId);
            const files = await store.listFiles();
            if (files.length === 0) {
                console.log(`No memory files for chat ${chatId}`);
            }

            for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
                console.log(`\n===== ${file.path} (updated ${file.updatedAt.toISOString()}) =====`);
                console.log(await store.readRaw(file.path));
            }
        } else if (command === "run") {
            console.log(JSON.stringify(await processChat(chatId), null, 2));
        } else if (command === "state") {
            console.log(`Watermark for chat ${chatId}: ${await getWatermark(chatId)}`);
        } else {
            console.error(`Unknown command '${command}'`);
            process.exit(1);
        }
    } finally {
        await Database.disconnect();
    }
}

run().catch((err) => {
    console.error(`Error occurred: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
