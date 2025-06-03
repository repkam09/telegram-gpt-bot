import { AtpAgent } from "@atproto/api";
import { Config } from "../../singletons/config";
// import { HennosOpenAIProvider, HennosOpenAISingleton } from "../../singletons/openai";

export class BlueskyInstance {

    static _instance: AtpAgent;

    static async init() {
        const agent = BlueskyInstance.instance();
        await agent.login({
            identifier: Config.AT_PROTO_USERNAME,
            password: Config.AT_PROTO_PASSWORD,
        });

        if (!agent.did) {
            throw new Error("Failed to login to Bluesky. Please check your credentials.");
        }

        console.log("Bluesky instance initialized successfully.");

        this.checkFeed();
        if (!Config.HENNOS_DEVELOPMENT_MODE) {
            setTimeout(() => {
                this.checkFeed();
            }, 1000 * 60 * 60); // Check feed every hour
        }
    }

    static instance(): AtpAgent {
        if (!BlueskyInstance._instance) {
            BlueskyInstance._instance = new AtpAgent({ service: Config.AT_PROTO_SERVICE });
        }

        return BlueskyInstance._instance;
    }


    static async checkFeed() {
        console.log("Checking Bluesky feed...");
        const agent = BlueskyInstance.instance();

        try {
            const response = await agent.app.bsky.feed.getTimeline({
                limit: 1,
            });

            if (response.data.feed.length > 0) {
                // Check if there are new posts from Mark Repka specifically
                const posts = response.data.feed.filter((post) => post.post.author.handle === "repkam09.com" && post.reply === undefined);
                if (posts.length > 0) {
                    console.log("New posts found from Mark Repka in Bluesky feed.");
                    posts.forEach(async (post) => {
                        // const openai = HennosOpenAISingleton.instance();
                        BlueskyInstance.replyToPost(post.post.uri, post.post.cid, "string");
                    });
                }

                console.log("New posts found in Bluesky feed.");
            } else {
                console.log("No new posts in Bluesky feed.");
            }
        } catch (error) {
            console.error("Error checking Bluesky feed:", error);
        }
    }

    static async replyToPost(postUri: string, postCid: string, text: string) {
        const agent = BlueskyInstance.instance();

        try {
            const reply = await agent.post({
                text: text,
                reply: {
                    $type: "app.bsky.feed.post#replyRef",
                    root: {
                        $type: "com.atproto.repo.strongRef",
                        uri: postUri,
                        cid: postCid,
                    },
                    parent: {
                        $type: "com.atproto.repo.strongRef",
                        uri: postUri,
                        cid: postCid,
                    },
                },
            });

            console.log(`Reply URI: ${reply.uri}, Reply CID: ${reply.cid}`);
            return reply;
        } catch (error) {
            console.error("Error replying to post:", error);
            throw error;
        }
    }
}