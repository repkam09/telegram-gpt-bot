import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Database } from "../src/database";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "./helpers/database";

describe("ephemeral test database", () => {
    let testDb: TestDatabase;

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
    });

    it("is available through the application's Database singleton", () => {
        expect(Database.instance()).toBe(testDb.db);
    });

    it("is seeded with a whitelisted account with chatId 0", async () => {
        const user = await testDb.db.user.findUnique({ where: { chatId: BigInt(TEST_CHAT_ID) } });
        expect(user).toMatchObject({ firstName: "Test", whitelisted: true });
    });

    it("uses the real schema", async () => {
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", content: "hello" } });
        const rows = await testDb.db.messages.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ type: "text", role: "user", content: "hello", from: BigInt(-1) });
    });

    it("reset() clears data and re-seeds the default account", async () => {
        await testDb.db.messages.create({ data: { chatId: TEST_CHAT_ID, role: "user", content: "to be removed" } });
        await testDb.db.user.create({ data: { chatId: BigInt(42), firstName: "Other" } });

        await testDb.reset();

        expect(await testDb.db.messages.count()).toBe(0);
        const users = await testDb.db.user.findMany();
        expect(users).toHaveLength(1);
        expect(users[0].chatId).toBe(BigInt(TEST_CHAT_ID));
    });
});
