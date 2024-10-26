import { PrismockClient } from "prismock";
import { HennosUser } from "../singletons/user";
import { Database } from "../singletons/sqlite";
import { handleImageMessage } from "./photos";
import { Config } from "../singletons/config";
import { HennosResponse } from "../singletons/base";

jest.mock("fs/promises", () => {
    return {
        readFile: jest.fn(() => Promise.resolve(Buffer.from("file-content"))),
    };
});

describe("Photos Handler", () => {
    const prismaClient = new PrismockClient();
    let user: HennosUser;

    beforeAll(async () => {
        Config.HENNOS_MOCK_PROVIDERS = true;
        await Database.init(prismaClient);
    });

    beforeEach(async () => {
        user = await HennosUser.async(-1, "Jest", "Test", "jest");
        user.setWhitelisted(true);
        user.setPreferredProvider("mock");
    });

    afterEach(async () => {
        await prismaClient.media.deleteMany();
        await prismaClient.messages.deleteMany();
    });


    describe("handleImageMessage", () => {
        test("should handle image without query", async () => {
            const response = await handleImageMessage(user, { local: "local", mime: "mime" });
            expect(response).toEqual({ __type: "empty" });
        });

        test("should handle image with query", async () => {
            const response = await handleImageMessage(user, { local: "local", mime: "mime" }, "query");
            expect(response).toEqual<HennosResponse>({
                __type: "string",
                payload: expect.any(String)
            });
        });
    });
});