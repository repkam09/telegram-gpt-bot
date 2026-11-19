/* eslint-disable @typescript-eslint/no-explicit-any */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { PuppeteerLifeCycleEvent } from "puppeteer";

dotenv.config();

export type HennosModelConfig = {
    MODEL: any
    CTX: number
}

export type HennosEmbedModelConfig = {
    MODEL: any,
    LENGTH: number
}

export type HennosModelProvider = "ollama" | "litellm"

export const HENNOS_LLM_PROVIDERS = ["ollama", "litellm"];

export class Config {
    static get HENNOS_DEVELOPMENT_MODE(): boolean {
        if (!process.env.HENNOS_DEVELOPMENT_MODE) {
            return false;
        }

        return process.env.HENNOS_DEVELOPMENT_MODE === "true";
    }

    static get HENNOS_VERBOSE_LOGGING(): boolean {
        if (!process.env.HENNOS_VERBOSE_LOGGING) {
            return false;
        }

        return process.env.HENNOS_VERBOSE_LOGGING === "true";
    }

    static get HENNOS_LLM_PROVIDER(): HennosModelProvider {
        if (!process.env.HENNOS_LLM_PROVIDER) {
            return "ollama";
        }

        // Validate provider
        if (HENNOS_LLM_PROVIDERS.indexOf(process.env.HENNOS_LLM_PROVIDER) === -1) {
            throw new Error("Invalid HENNOS_LLM_PROVIDER value");
        }

        return process.env.HENNOS_LLM_PROVIDER as HennosModelProvider;
    }

    static get HENNOS_DOCUMENT_MAX_RAW_LENGTH(): number {
        if (Config.HENNOS_DEVELOPMENT_MODE) {
            return 1;
        }

        return 32000;
    }

    static get HENNOS_LEGACY_LLM_PROVIDER(): HennosModelProvider | null {
        if (!process.env.HENNOS_LEGACY_LLM_PROVIDER) {
            return null;
        }

        // Validate provider
        if (HENNOS_LLM_PROVIDERS.indexOf(process.env.HENNOS_LEGACY_LLM_PROVIDER) === -1) {
            throw new Error("Invalid HENNOS_LEGACY_LLM_PROVIDER value");
        }

        return process.env.HENNOS_LEGACY_LLM_PROVIDER as HennosModelProvider;
    }

    static get HENNOS_DOCUMENTS_ENABLED(): false {
        return false;
    }

    static get HENNOS_TOOL_DEPTH(): number {
        if (!process.env.HENNOS_TOOL_DEPTH) {
            return 6;
        }

        const depth = parseInt(process.env.HENNOS_TOOL_DEPTH);

        if (Number.isNaN(depth)) {
            throw new Error("Invalid HENNOS_TOOL_DEPTH value");
        }

        return depth;
    }

    static get HENNOS_MEMORY_ENABLED(): boolean {
        if (!process.env.HENNOS_MEMORY_ENABLED) {
            return false;
        }

        return process.env.HENNOS_MEMORY_ENABLED === "true";
    }

    static get HENNOS_GMAIL_ENABLED(): boolean {
        if (!process.env.HENNOS_GMAIL_ENABLED) {
            return false;
        }

        return process.env.HENNOS_GMAIL_ENABLED === "true";
    }

    static get HENNOS_TELEGRAM_ENABLED(): boolean {
        if (!process.env.HENNOS_TELEGRAM_ENABLED) {
            return false;
        }

        return process.env.HENNOS_TELEGRAM_ENABLED === "true";
    }

    static get HENNOS_API_ENABLED(): boolean {
        if (!process.env.HENNOS_API_ENABLED) {
            return false;
        }

        return process.env.HENNOS_API_ENABLED === "true";
    }

    static get HENNOS_SUPABASE_ENABLED(): boolean {
        if (!process.env.HENNOS_SUPABASE_ENABLED) {
            return false;
        }

        return process.env.HENNOS_SUPABASE_ENABLED === "true";
    }

    static get HENNOS_API_PORT(): number {
        if (!process.env.HENNOS_API_PORT) {
            return 16006;
        }

        const port = parseInt(process.env.HENNOS_API_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid HENNOS_API_PORT value");
        }

        return port;
    }

    static get TELEGRAM_BOT_WEBHOOK_EXTERNAL(): string | false {
        if (!process.env.TELEGRAM_BOT_WEBHOOK_EXTERNAL) {
            return false;
        }

        return process.env.TELEGRAM_BOT_WEBHOOK_EXTERNAL;
    }

    static get LITELLM_LLM(): HennosModelConfig {
        if (!process.env.LITELLM_LLM) {
            return {
                MODEL: "hennos_dynamic",
                CTX: 32000,
            };
        }

        return parseHennosModelString(process.env.LITELLM_LLM, "LITELLM_LLM");
    }

    /** LiteLLM model for the 'low' tier. Defaults to LITELLM_LLM, so routing is a no-op until configured. */
    static get LITELLM_MINI_LLM(): HennosModelConfig {
        if (!process.env.LITELLM_MINI_LLM) {
            return Config.LITELLM_LLM;
        }

        return parseHennosModelString(process.env.LITELLM_MINI_LLM, "LITELLM_MINI_LLM");
    }

    /** LiteLLM model for the 'nano' tier. Defaults to LITELLM_LLM, so routing is a no-op until configured. */
    static get LITELLM_NANO_LLM(): HennosModelConfig {
        if (!process.env.LITELLM_NANO_LLM) {
            return Config.LITELLM_LLM;
        }

        return parseHennosModelString(process.env.LITELLM_NANO_LLM, "LITELLM_NANO_LLM");
    }

    /**
     * Optional LiteLLM decision model (e.g. `jev`) that picks the model tier for each prompt through `/v1/decisions`.
     * When unset every prompt uses the high tier.
     */
    static get HENNOS_CLASSIFIER_DECISION_MODEL(): string | null {
        if (!process.env.HENNOS_CLASSIFIER_DECISION_MODEL) {
            return null;
        }

        return process.env.HENNOS_CLASSIFIER_DECISION_MODEL;
    }

    static get LITELLM_BYOK_ENABLED(): boolean {
        if (!process.env.LITELLM_BYOK_ENABLED) {
            return false;
        }

        return process.env.LITELLM_BYOK_ENABLED === "true";
    }

    static get LITELLM_API_KEY(): string {
        if (!process.env.LITELLM_API_KEY) {
            throw new Error("Missing LITELLM_API_KEY");
        }

        return process.env.LITELLM_API_KEY;
    }

    static get LITELLM_BASE_URL(): string {
        if (!process.env.LITELLM_BASE_URL) {
            throw new Error("Missing LITELLM_BASE_URL");
        }

        return process.env.LITELLM_BASE_URL;
    }

    /** LiteLLM model name used for voice and audio message transcription (`/v1/audio/transcriptions`). */
    static get LITELLM_TRANSCRIPTION_MODEL(): string {
        if (!process.env.LITELLM_TRANSCRIPTION_MODEL) {
            return "whisper-1";
        }

        return process.env.LITELLM_TRANSCRIPTION_MODEL;
    }

    /** LiteLLM model name used by the image generation tool (`/v1/images/generations`). */
    static get LITELLM_IMAGE_MODEL(): string {
        if (!process.env.LITELLM_IMAGE_MODEL) {
            throw new Error("Missing LITELLM_IMAGE_MODEL");
        }

        return process.env.LITELLM_IMAGE_MODEL;
    }

    /** Only used by the OpenAI Realtime SIP voice call handler. Chat, audio and images all go through LiteLLM. */
    static get OPENAI_API_KEY(): string {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        return process.env.OPENAI_API_KEY;
    }

    static get OLLAMA_LLM(): HennosModelConfig {
        if (!process.env.OLLAMA_LLM) {
            return {
                MODEL: "repkam09/hennos-qwen3.5:latest",
                CTX: 102400,
            };
        }
        return parseHennosModelString(process.env.OLLAMA_LLM, "OLLAMA_LLM");
    }

    static get OLLAMA_LLM_EMBED(): HennosEmbedModelConfig {
        if (!process.env.OLLAMA_LLM_EMBED) {
            return {
                MODEL: "nomic-embed-text:latest",
                LENGTH: 512
            };
        }

        return parseHennosEmbedModelString(process.env.OLLAMA_LLM_EMBED, "OLLAMA_LLM_EMBED");
    }


    static get OLLAMA_HOST(): string {
        if (!process.env.OLLAMA_HOST) {
            return "localhost";
        }

        return process.env.OLLAMA_HOST;
    }

    static get OLLAMA_PORT(): number {
        if (!process.env.OLLAMA_PORT) {
            return 11434;
        }

        const port = parseInt(process.env.OLLAMA_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid OLLAMA_PORT value");
        }

        return port;
    }

    static get TERRARIUM_ENABLED(): boolean {
        if (!process.env.TERRARIUM_ENABLED) {
            return false;
        }

        return process.env.TERRARIUM_ENABLED === "true";
    }

    static get TERRARIUM_HOST(): string {
        if (!process.env.TERRARIUM_HOST) {
            return "localhost";
        }

        return process.env.TERRARIUM_HOST;
    }

    static get TERRARIUM_PORT(): number {
        if (!process.env.TERRARIUM_PORT) {
            return 8080;
        }

        const port = parseInt(process.env.TERRARIUM_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid TERRARIUM_PORT value");
        }

        return port;
    }

    static get TELEGRAM_BOT_KEY(): string {
        if (!process.env.TELEGRAM_BOT_KEY) {
            throw new Error("Missing TELEGRAM_BOT_KEY");
        }

        return process.env.TELEGRAM_BOT_KEY;
    }

    static get TELEGRAM_BOT_ADMIN(): string | false {
        if (!process.env.TELEGRAM_BOT_ADMIN) {
            return false;
        }

        return process.env.TELEGRAM_BOT_ADMIN;
    }

    static get GMAIL_CLIENT_ID(): string {
        if (!process.env.GMAIL_CLIENT_ID) {
            throw new Error("Missing GMAIL_CLIENT_ID");
        }

        return process.env.GMAIL_CLIENT_ID;
    }

    static get GMAIL_CLIENT_SECRET(): string {
        if (!process.env.GMAIL_CLIENT_SECRET) {
            throw new Error("Missing GMAIL_CLIENT_SECRET");
        }

        return process.env.GMAIL_CLIENT_SECRET;
    }

    static get GMAIL_REFRESH_TOKEN(): string {
        if (!process.env.GMAIL_REFRESH_TOKEN) {
            throw new Error("Missing GMAIL_REFRESH_TOKEN");
        }

        return process.env.GMAIL_REFRESH_TOKEN;
    }

    static get AT_PROTO_SERVICE(): string {
        if (!process.env.AT_PROTO_SERVICE) {
            return "https://bsky.social";
        }

        return process.env.AT_PROTO_SERVICE;
    }

    static get AT_PROTO_USERNAME(): string {
        if (!process.env.AT_PROTO_USERNAME) {
            throw new Error("Missing AT_PROTO_USERNAME");
        }

        return process.env.AT_PROTO_USERNAME;
    }

    static get AT_PROTO_PASSWORD(): string {
        if (!process.env.AT_PROTO_PASSWORD) {
            throw new Error("Missing AT_PROTO_PASSWORD");
        }

        return process.env.AT_PROTO_PASSWORD;
    }

    static get OPEN_WEATHER_API(): string | false {
        if (!process.env.OPEN_WEATHER_API) {
            return false;
        }

        return process.env.OPEN_WEATHER_API;
    }

    static get WOLFRAM_ALPHA_APP_ID(): string | false {
        if (!process.env.WOLFRAM_ALPHA_APP_ID) {
            return false;
        }

        return process.env.WOLFRAM_ALPHA_APP_ID;
    }

    static get GITHUB_API_KEY(): string | false {
        if (!process.env.GITHUB_API_KEY) {
            return false;
        }

        return process.env.GITHUB_API_KEY;
    }

    static get BRAVE_SEARCH_API_KEY(): string | false {
        if (!process.env.BRAVE_SEARCH_API_KEY) {
            return false;
        }

        return process.env.BRAVE_SEARCH_API_KEY;
    }

    static get JELLYSEER_API_KEY(): string | false {
        if (!process.env.JELLYSEER_API_KEY) {
            return false;
        }

        return process.env.JELLYSEER_API_KEY;
    }

    static get JELLYSEER_BASE_URL(): string {
        if (!process.env.JELLYSEER_BASE_URL) {
            return "localhost:5055";
        }

        return process.env.JELLYSEER_BASE_URL;
    }

    static get JELLYFIN_BASE_URL(): string | false {
        if (!process.env.JELLYFIN_BASE_URL) {
            return false;
        }

        return process.env.JELLYFIN_BASE_URL;
    }

    static get PUPPETEER_WAIT_UNTIL(): PuppeteerLifeCycleEvent {
        if (!process.env.PUPPETEER_WAIT_UNTIL) {
            return "networkidle2";
        }

        return "networkidle2";
    }

    static get TEMPORAL_HOST(): string {
        if (!process.env.TEMPORAL_HOST) {
            return "localhost";
        }

        return process.env.TEMPORAL_HOST;
    }

    static get TEMPORAL_PORT(): number {
        if (!process.env.TEMPORAL_PORT) {
            return 7233;
        }

        const port = parseInt(process.env.TEMPORAL_PORT);

        if (Number.isNaN(port)) {
            throw new Error("Invalid TEMPORAL_PORT value");
        }

        return port;
    }

    static get TEMPORAL_NAMESPACE(): string {
        if (!process.env.TEMPORAL_NAMESPACE) {
            return "default";
        }

        return process.env.TEMPORAL_NAMESPACE;
    }

    static get TEMPORAL_TASK_QUEUE(): string {
        if (!process.env.TEMPORAL_TASK_QUEUE) {
            return "development";
        }

        return process.env.TEMPORAL_TASK_QUEUE;
    }

    static get TEMPORAL_API_KEY(): string | undefined {
        if (!process.env.TEMPORAL_API_KEY) {
            return undefined;
        }

        return process.env.TEMPORAL_API_KEY;
    }

    static get TEMPORAL_USE_TLS(): boolean {
        if (!process.env.TEMPORAL_USE_TLS) {
            return false;
        }

        return process.env.TEMPORAL_USE_TLS.toLowerCase() === "true";
    }

    static get SUPABASE_URL(): string | false {
        if (!process.env.SUPABASE_URL) {
            return false;
        }

        return process.env.SUPABASE_URL;
    }

    static get SUPABASE_PUBLISHABLE_KEY(): string | false {
        if (!process.env.SUPABASE_PUBLISHABLE_KEY) {
            return false;
        }

        return process.env.SUPABASE_PUBLISHABLE_KEY;
    }

    static get SUPABASE_KEEPALIVE_EMAIL(): string | false {
        if (!process.env.SUPABASE_KEEPALIVE_EMAIL) {
            return false;
        }

        return process.env.SUPABASE_KEEPALIVE_EMAIL;
    }

    static get SUPABASE_KEEPALIVE_PASSWORD(): string | false {
        if (!process.env.SUPABASE_KEEPALIVE_PASSWORD) {
            return false;
        }

        return process.env.SUPABASE_KEEPALIVE_PASSWORD;
    }

    static LOCAL_STORAGE(workflowId: string): string {
        if (!process.env.LOCAL_STORAGE) {
            return os.tmpdir();
        }

        const cwd = path.join(__dirname, "../", "../");
        if (workflowId) {
            const dir = path.join(cwd, process.env.LOCAL_STORAGE, workflowId);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }

            return dir;
        }

        const dir = path.join(cwd, process.env.LOCAL_STORAGE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        return dir;
    }
}


function parseHennosModelString(value: string, env: string): HennosModelConfig {
    const parts = value.split(",");

    if (parts.length !== 2) {
        throw new Error(`Invalid value for ${env}`);
    }

    const ctxInLength = parseInt(parts[1]);

    if (Number.isNaN(ctxInLength)) {
        throw new Error("Invalid context length value for " + env);
    }

    return {
        MODEL: parts[0],
        CTX: ctxInLength,
    };
}

function parseHennosEmbedModelString(value: string, env: string): HennosEmbedModelConfig {
    const parts = value.split(",");

    if (parts.length !== 2) {
        throw new Error(`Invalid value for ${env}`);
    }

    const length = parseInt(parts[1]);

    if (Number.isNaN(length)) {
        throw new Error("Invalid length value for " + env);
    }

    return {
        MODEL: parts[0],
        LENGTH: length,
    };
}