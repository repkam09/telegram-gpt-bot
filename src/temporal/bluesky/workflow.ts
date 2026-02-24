
import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "./activities";

const { fetchPosts, signalBlueskySummary } = proxyActivities<typeof activities>({
    startToCloseTimeout: "60 seconds",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

const { summarizePosts } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: {
        backoffCoefficient: 1,
        initialInterval: "3 seconds",
        maximumAttempts: 5,
    },
});

export async function reviewBlueskyWorkflow() {
    const posts = await fetchPosts();

    log.info(`Found ${posts.length} posts to review`);

    if (posts.length === 0) {
        log.info("No posts to summarize, exiting workflow");
        return;
    }

    log.debug(`Total posts to summarize: ${posts.length}`);
    const summary = await summarizePosts(posts);

    log.debug(`Summary generated: ${summary}`);

    await signalBlueskySummary(summary);
    log.info("Summary sent to signal, workflow complete");
}