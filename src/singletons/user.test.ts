import { PrismockClient } from "prismock";
import { Database } from "./sqlite";
import { HennosUser } from "./user";
import { Message } from "ollama";

jest.mock("fs/promises", () => {
    return {
        readFile: jest.fn(() => Promise.resolve(Buffer.from("file-content"))),
    };
});

describe("Hennos User", () => {
    const prismaClient = new PrismockClient();
    let user: HennosUser;

    beforeAll(async () => {
        await Database.init(prismaClient);
    });

    beforeEach(async () => {
        user = await HennosUser.async(-1, "Jest", "Test", "jest");
    });

    afterEach(async () => {
        await prismaClient.media.deleteMany();
        await prismaClient.messages.deleteMany();
    });

    describe("Chat Context", () => {
        test("should get chat context", async () => {
            const context = await user.getChatContext();
            expect(context).toEqual([]);
        });

        test("should set some chat context", async () => {
            await user.updateChatContext("user", "test");
            const context = await user.getChatContext();
            expect(context).toEqual<Message[]>([{
                role: "user",
                content: "test"
            }]);
        });

        test("should set some image context", async () => {
            await user.updateChatContextImage("user", {
                local: "local",
                mime: "mime"
            });
            const context = await user.getChatContext();
            expect(context).toEqual<Message[]>([
                {
                    "content": expect.any(String),
                    "images": [
                        "ZmlsZS1jb250ZW50",
                    ],
                    "role": "user_image",
                },]);
        });
    });
});