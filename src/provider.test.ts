import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveModelProvider } from "./provider";
import { HennosOpenAIProvider } from "./singletons/openai";
import { createWorkflowId } from "./temporal/legacy/interface";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../tests/helpers/database";

describe("resolveModelProvider", () => {
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

    it.each(["openai", "anthropic"])("resolves the LiteLLM provider for a user still set to the removed '%s' provider", async (removed) => {
        vi.stubEnv("LITELLM_BASE_URL", "https://litellm.example.com/v1");
        vi.stubEnv("LITELLM_API_KEY", "sk-test");
        await testDb.db.user.update({ where: { chatId: BigInt(TEST_CHAT_ID) }, data: { provider: removed } });

        const provider = await resolveModelProvider(workflowId, "high");

        expect(provider).toBeInstanceOf(HennosOpenAIProvider);
    });
});
