import { describe, expect, it, vi } from "vitest";
import { Config } from "./config";

describe("Config defaults", () => {
    it("uses safe defaults when nothing is configured", () => {
        expect(Config.HENNOS_DEVELOPMENT_MODE).toBe(false);
        expect(Config.HENNOS_VERBOSE_LOGGING).toBe(false);
        expect(Config.HENNOS_LLM_PROVIDER).toBe("ollama");
        expect(Config.HENNOS_LEGACY_LLM_PROVIDER).toBeNull();
        expect(Config.HENNOS_CLASSIFIER_ENABLED).toBe(true);
        expect(Config.HENNOS_MEMORY_ENABLED).toBe(false);
        expect(Config.HENNOS_TOOL_DEPTH).toBe(6);
        expect(Config.TEMPORAL_HOST).toBe("localhost");
        expect(Config.TEMPORAL_PORT).toBe(7233);
        expect(Config.TEMPORAL_NAMESPACE).toBe("default");
        expect(Config.TEMPORAL_TASK_QUEUE).toBe("development");
        expect(Config.TEMPORAL_API_KEY).toBeUndefined();
        expect(Config.TEMPORAL_USE_TLS).toBe(false);
        expect(Config.SUPABASE_URL).toBe(false);
    });
});

describe("Config overrides", () => {
    it("reads boolean flags that are exactly 'true'", () => {
        vi.stubEnv("HENNOS_DEVELOPMENT_MODE", "true");
        vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");

        expect(Config.HENNOS_DEVELOPMENT_MODE).toBe(true);
        expect(Config.HENNOS_MEMORY_ENABLED).toBe(true);
    });

    it("treats any other value of a boolean flag as false", () => {
        vi.stubEnv("HENNOS_DEVELOPMENT_MODE", "yes");

        expect(Config.HENNOS_DEVELOPMENT_MODE).toBe(false);
    });

    it("lets the classifier be disabled explicitly", () => {
        vi.stubEnv("HENNOS_CLASSIFIER_ENABLED", "false");

        expect(Config.HENNOS_CLASSIFIER_ENABLED).toBe(false);
    });

    it("parses TLS case-insensitively", () => {
        vi.stubEnv("TEMPORAL_USE_TLS", "TRUE");

        expect(Config.TEMPORAL_USE_TLS).toBe(true);
    });

    it("parses numeric settings", () => {
        vi.stubEnv("TEMPORAL_PORT", "7234");
        vi.stubEnv("HENNOS_TOOL_DEPTH", "3");

        expect(Config.TEMPORAL_PORT).toBe(7234);
        expect(Config.HENNOS_TOOL_DEPTH).toBe(3);
    });

    it("rejects non-numeric numeric settings", () => {
        vi.stubEnv("TEMPORAL_PORT", "abc");
        vi.stubEnv("HENNOS_TOOL_DEPTH", "deep");

        expect(() => Config.TEMPORAL_PORT).toThrow("Invalid TEMPORAL_PORT value");
        expect(() => Config.HENNOS_TOOL_DEPTH).toThrow("Invalid HENNOS_TOOL_DEPTH value");
    });

    it("accepts known LLM providers", () => {
        vi.stubEnv("HENNOS_LLM_PROVIDER", "anthropic");
        vi.stubEnv("HENNOS_LEGACY_LLM_PROVIDER", "openai");

        expect(Config.HENNOS_LLM_PROVIDER).toBe("anthropic");
        expect(Config.HENNOS_LEGACY_LLM_PROVIDER).toBe("openai");
    });

    it("rejects unknown LLM providers", () => {
        vi.stubEnv("HENNOS_LLM_PROVIDER", "skynet");
        vi.stubEnv("HENNOS_LEGACY_LLM_PROVIDER", "skynet");
        vi.stubEnv("HENNOS_DOCUMENT_EMBED_PROVIDER", "anthropic");

        expect(() => Config.HENNOS_LLM_PROVIDER).toThrow("Invalid HENNOS_LLM_PROVIDER value");
        expect(() => Config.HENNOS_LEGACY_LLM_PROVIDER).toThrow("Invalid HENNOS_LEGACY_LLM_PROVIDER value");
        expect(() => Config.HENNOS_DOCUMENT_EMBED_PROVIDER).toThrow("Invalid HENNOS_DOCUMENT_EMBED_PROVIDER value");
    });

    it("shrinks the document size limit in development mode", () => {
        expect(Config.HENNOS_DOCUMENT_MAX_RAW_LENGTH).toBe(32000);

        vi.stubEnv("HENNOS_DEVELOPMENT_MODE", "true");
        expect(Config.HENNOS_DOCUMENT_MAX_RAW_LENGTH).toBe(1);
    });
});
