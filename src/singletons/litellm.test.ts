import { describe, expect, it, vi } from "vitest";
import { HennosLiteLLMSingleton } from "./litellm";

describe("HennosLiteLLMSingleton.dynamic", () => {
    it("uses a different model, with its own context limit, per tier", async () => {
        vi.stubEnv("LITELLM_BASE_URL", "https://litellm.example.com/v1");
        vi.stubEnv("LITELLM_API_KEY", "sk-test");
        vi.stubEnv("LITELLM_LLM", "big-model,64000");
        vi.stubEnv("LITELLM_MINI_LLM", "mid-model,32000");
        vi.stubEnv("LITELLM_NANO_LLM", "tiny-model,8000");

        expect((await HennosLiteLLMSingleton.dynamic("wf", "high")).limit()).toBe(64000);
        expect((await HennosLiteLLMSingleton.dynamic("wf", "low")).limit()).toBe(32000);
        expect((await HennosLiteLLMSingleton.dynamic("wf", "nano")).limit()).toBe(8000);
        expect((await HennosLiteLLMSingleton.dynamic("wf")).limit()).toBe(64000);
    });
});
