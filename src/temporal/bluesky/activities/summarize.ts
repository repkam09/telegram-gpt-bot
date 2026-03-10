import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { BlueskyInstance } from "../../../singletons/bluesky";

/**
 * Summarizes a list of posts.
 * 
 * @param posts - The posts to summarize.
 * @returns A summary of the posts.
 */
export async function summarizePosts(posts: FeedViewPost[]): Promise<string> {
    const promises = posts.map((post) => BlueskyInstance.formatPost(post));
    const formatted = await Promise.all(promises);
    const summary = formatted.join("\n\n");
    return summary;
}