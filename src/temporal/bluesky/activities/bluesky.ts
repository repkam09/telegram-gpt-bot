import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { BlueskyInstance } from "../../../singletons/bluesky";

/**
 * Check Bluesky for new posts and return their IDs
 */
export async function fetchPosts(): Promise<FeedViewPost[]> {
    return BlueskyInstance.fetchPosts();
}
