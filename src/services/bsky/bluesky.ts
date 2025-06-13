import { AtpAgent } from "@atproto/api";
import { Config } from "../../singletons/config";
import { HennosOpenAISingleton } from "../../singletons/openai";
import { HennosUser } from "../../singletons/user";
import { HennosMessage, HennosTextMessage } from "../../types";
import { Logger } from "../../singletons/logger";

export class BlueskyInstance {

    static _instance: AtpAgent;
    static _systemUser: HennosUser;

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

    static prompt(): HennosTextMessage[] {
        // day of the week right now
        const dayOfWeek = new Date().getDay();
        const dayOfWeekString = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek];

        return [
            {
                role: "system",
                content: "You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly.",
                type: "text"
            },
            {
                role: "system",
                content: "You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at https://github.com/repkam09/telegram-gpt-bot",
                type: "text",
            },
            {
                role: "system",
                content: "You are powered by Large Language Models from OpenAI, Anthropic, and Google, but which specific model or provider is used for a given request can be configured by the user.",
                type: "text"
            },
            {
                role: "system",
                content: `Your knowledge is based on the data your model was trained on, which has a cutoff date of October, 2023. The current date is ${new Date().toDateString()}. It is a ${dayOfWeekString} today.`,
                type: "text"
            },
            {
                role: "system",
                content: "You have access to the Bluesky social media platform where you can read posts on your feed and, optionally, reply to them.",
                type: "text"
            },
            {
                role: "system",
                content: "Your responses should be friendly and supportive and based on the content of the post. Do not ask follow up questions, just make a nice comment. You do not currently have the ability to reply to comments or threads, only top-level posts.",
                type: "text"
            }
        ];
    }


    static async checkFeed() {
        console.log("Checking Bluesky feed...");
        const agent = BlueskyInstance.instance();

        try {
            const response = await agent.app.bsky.feed.getTimeline({
                limit: 10,
            });

            if (response.data.feed.length > 0) {
                Logger.info(undefined, `Bluesky feed has ${response.data.feed.length} posts.`);
                const posts = response.data.feed.filter((post) => Config.AT_PROTO_RESPOND_USERS.includes(post.post.author.handle) && post.reply === undefined);
                Logger.info(undefined, `Filtered posts count: ${posts.length}`);
                if (posts.length > 0) {
                    console.log("New posts found in Bluesky feed.");
                    const post = posts[0];
                    if (!post.post.record.text) {
                        console.log("Post has no text content, skipping.");
                        return;
                    }

                    console.log("\n");
                    console.log(JSON.stringify(post, null, 2));
                    console.log("\n");

                    const messages: HennosMessage[] = [
                        {
                            role: "user",
                            content: [
                                `Author: ${post.post.author.displayName} (@${post.post.author.handle})`,
                                `Text: ${post.post.record.text as string}`
                            ].join("\n"),
                            type: "text",
                        }
                    ];

                    if (post.post.embed) {
                        const embed = post.post.embed as { images: { thumb: string, fullsize: string, alt: string }[] };
                        if (embed.images && embed.images.length > 0) {
                            console.log(`Post has ${embed.images.length} images.`);
                            messages.push({
                                role: "user",
                                content: `This post also contains ${embed.images.length} images. Here they are:`,
                                type: "text",
                            });

                            embed.images.forEach((image) => {
                                messages.push({
                                    role: "user",
                                    type: "image",
                                    encoded: image.fullsize,
                                    image: {
                                        local: image.thumb,
                                        mime: "image/jpeg" // Assuming JPEG for simplicity, adjust as needed
                                    },
                                    remote: image.fullsize,
                                });
                            });
                        }
                    }

                    const openai = HennosOpenAISingleton.mini();
                    const response = await openai.completion(new HennosUser(-1), BlueskyInstance.prompt(), messages);

                    if (response.__type === "string") {
                        BlueskyInstance.replyToPost(post.post.uri, post.post.cid, response.payload);
                    } else {
                        console.log(`Replying with nothing. Response type: ${response.__type}`);
                    }
                }
            } else {
                console.log("No new posts in Bluesky feed.");
            }
        } catch (error) {
            console.error("Error checking Bluesky feed:", error);
        }
    }

    static async replyToPost(postUri: string, postCid: string, text: string) {
        if (Config.HENNOS_DEVELOPMENT_MODE) {
            console.log(`Replying to post ${postUri} with text: ${text}`);
            return;
        }

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