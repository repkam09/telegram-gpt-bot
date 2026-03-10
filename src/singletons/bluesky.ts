import AtpAgent from "@atproto/api";
import { Logger } from "./logger";
import { Config } from "./config";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";

export class BlueskyInstance {

    private static client: AtpAgent;

    static async init(): Promise<void> {
        const agent = new AtpAgent({ service: Config.AT_PROTO_SERVICE });
        await agent.login({
            identifier: Config.AT_PROTO_USERNAME,
            password: Config.AT_PROTO_PASSWORD,
        });

        Logger.info(undefined, "BlueskyInstance initialized successfully");
        BlueskyInstance.client = agent;
    }

    public static async fetchPosts(): Promise<FeedViewPost[]> {
        const response = await BlueskyInstance.client.app.bsky.feed.getTimeline({
            limit: 5,
        });

        const posts = [];

        for (const post of response.data.feed) {
            const embed = post.post.embed as { images: { thumb: string, fullsize: string, alt: string }[] };
            if (embed && embed.images && embed.images.length > 0) {
                // Skip posts with image embeds for now, as we don't have a way to handle them in the output.
            } else {
                posts.push(post);
            }
        }

        return posts;
    }

    public static async formatPost(post: FeedViewPost): Promise<string> {
        return JSON.stringify({
            authorDisplayName: post.post.author.displayName,
            authorHandle: `@${post.post.author.handle}`,
            content: post.post.record.text,
            bookmarkCount: post.post.bookmarkCount || 0,
            replyCount: post.post.replyCount || 0,
            likeCount: post.post.likeCount || 0,
            quoteCount: post.post.quoteCount || 0,
            createdAt: post.post.indexedAt
        });
    }
}
