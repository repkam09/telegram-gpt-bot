// Vitest setup file. Runs before every test file.
import { vi } from "vitest";

// Config calls dotenv.config() on import. Never let a developer's local .env leak into tests.
vi.mock("dotenv", () => ({
    config: vi.fn(),
    default: { config: vi.fn() },
}));

// The real Logger builds a new pino transport (a worker thread) on every call. Tests use silent mocks
// instead; assert on `Logger.error` etc. when logging behavior matters.
vi.mock("../src/singletons/logger", () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
    },
}));

// Start every test file from a clean slate for anything Config reads. Tests opt in to values with vi.stubEnv().
const SCRUBBED_PREFIXES = [
    "HENNOS_",
    "TEMPORAL_",
    "TELEGRAM_",
    "OPENAI_",
    "ANTHROPIC_",
    "OLLAMA_",
    "LITELLM_",
    "SUPABASE_",
    "BRAVE_",
    "WOLFRAM_",
    "OPEN_WEATHER",
    "JELLYSEER_",
    "JELLYFIN_",
    "GITHUB_",
    "GMAIL_",
    "GOOGLE_",
    "AT_PROTO_",
    "TERRARIUM_",
    "PUPPETEER_",
];

for (const key of Object.keys(process.env)) {
    if (key === "DATABASE_URL" || key === "LOCAL_STORAGE" || SCRUBBED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        delete process.env[key];
    }
}
