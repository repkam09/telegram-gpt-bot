import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveLegacyModelProvider } from "./provider";
import { HennosOllamaProvider } from "./singletons/ollama";
import { createWorkflowId } from "./temporal/legacy/interface";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../tests/helpers/database";

describe("resolveLegacyModelProvider", () => {
    let testDb: TestDatabase;
    const workflowId = createWorkflowId("test", String(TEST_CHAT_ID));

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
    });

    it.each(["openai", "anthropic"])("falls back to the default provider for a user still set to the removed '%s' provider", async (removed) => {
        await testDb.db.user.update({ where: { chatId: BigInt(TEST_CHAT_ID) }, data: { provider: removed } });

        const provider = await resolveLegacyModelProvider(workflowId, "high");

        // HENNOS_LLM_PROVIDER defaults to ollama in tests
        expect(provider).toBeInstanceOf(HennosOllamaProvider);
    });
});
