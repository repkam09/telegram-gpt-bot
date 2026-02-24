import { BlueskyInstance } from "../singletons/bluesky";
import { Logger } from "../singletons/logger";

async function run() {
    await BlueskyInstance.init();

    const posts = await BlueskyInstance.fetchPosts();
    Logger.info(undefined, `Fetched ${posts.length} posts from Bluesky`);

    for (const post of posts) {
        const formatted = await BlueskyInstance.formatPost(post);
        Logger.info(undefined, formatted);
    }
}

run().catch((err) => {
    Logger.error(undefined, `Error occurred: ${err.message}`);
    process.exit(1);
});