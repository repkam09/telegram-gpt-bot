import { Schedule } from "../singletons/schedule";
import { ChatMemory } from "../singletons/memory";
import { sendMessageWrapper } from "../utils";
import Parser from "rss-parser";

const rss_feed_users = "rss_feed_users";

export default async function init() {
    Schedule.recurring(1, rss_feed_check);

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
    console.log("Fetching feed updates for " + id);
    const feeds = await getUserFeedsList(id);
    const parser = new Parser();

    feeds.forEach(async (url) => {
        const results = await parser.parseURL(url);
        await sendMessageWrapper(id, results.title || url);
        results.items.forEach(item => {
            sendMessageWrapper(id, item.title + ":" + item.link);
        });
    });
}

async function rss_feed_check() {
    const users = await getFeedUserList();
    users.forEach((user) => {
        getUserFeedUpdates(user);
    });
}
