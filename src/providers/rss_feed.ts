import { Schedule } from "../singletons/schedule";
import { ChatMemory } from "../singletons/memory";
import { sendMessageWrapper } from "../utils";
import Parser from "rss-parser";
import crypto from "node:crypto";
import { Logger } from "../singletons/logger";

const rss_feed_users = "rss_feed_users";

export default async function init() {
    Schedule.recurring(60, rss_feed_check, "rss_feed_check");

    const result_string = await ChatMemory.getSystemValue(rss_feed_users);
    if (!result_string) {
        await ChatMemory.storeSystemValue<number[]>(rss_feed_users, []);
    }
}

export async function getFeedUserList() {
    const result = await ChatMemory.getSystemValue<number[]>(rss_feed_users);
    return new Set<number>(result || []);
}

export async function getUserFeedsList(id: number): Promise<Set<string>> {
    const result = await ChatMemory.getPerUserValue<string[]>(id, "feeds");
    if (!result) {
        return new Set<string>();
    }

    return new Set<string>(result);
}

export async function getUserSeenEntriesList(id: number): Promise<string[]> {
    const result = await ChatMemory.getPerUserValue<string[]>(id, "seen_feeds");
    if (!result) {
        return [];
    }

    return result;
}

export async function updateUserSeenEntriesList(id: number, current: string[]): Promise<void> {
    await ChatMemory.storePerUserValue<string[]>(id, "seen_feeds", current);
} 

export async function addUserFeed(id: number, feed: string) {
    const currentUsers = await getFeedUserList();
    if (!currentUsers.has(id)) {
        currentUsers.add(id);
        await ChatMemory.storeSystemValue<number[]>(rss_feed_users, Array.from(currentUsers));
    }

    const currentFeeds = await getUserFeedsList(id);
    currentFeeds.add(feed);

    await ChatMemory.storePerUserValue<string[]>(id, "feeds", Array.from(currentFeeds));
}

export async function getUserFeedUpdates(id: number) {
    const urls = await getUserFeedsList(id);
    const parser = new Parser();

    let counter = 0;

    urls.forEach(async (url) => {
        try {
            const results = await parser.parseURL(url);
        
            const message: string[] = [];
            const seen = await getUserSeenEntriesList(id);
        
            results.items.forEach(item => {
                const guid = buildGuidForEntry(item);
                if (!seen.includes(guid)) {
                    message.push(`[${item.title}](${item.link})`);
                    counter = counter + 1;
                    seen.push(guid);
                }
            });

            await updateUserSeenEntriesList(id, seen);
            if (message.length > 0) {
                await sendMessageWrapper(id, message.join("\n\n"), { disable_notification: true });
            }
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(`${id}: Unable to parse feeds from URL ${url}. Error: ${error.message}`);
        }
    });

    if (counter > 0) {
        Logger.debug(`Fetched Feeds for ${id}, ${counter} new entries`);
    } else {
        Logger.debug(`Fetched Feeds for ${id}, no new entries`);
    }
}

function buildGuidForEntry(item: Parser.Item): string {
    const digest = crypto.createHash("sha256");
    if (item.guid) {
        return digest.update(item.guid).digest("hex");
    }

    if (item.title && item.creator) {
        return digest.update(item.title + item.creator).digest("hex");
    }

    if (item.title) {
        return digest.update(item.title).digest("hex");
    }

    return digest.update(JSON.stringify(item)).digest("hex");
}

async function rss_feed_check() {
    const users = await getFeedUserList();
    users.forEach((user) => {
        Logger.info(`${user}: Starting Feed Updates`);
        getUserFeedUpdates(user);
    });
}
