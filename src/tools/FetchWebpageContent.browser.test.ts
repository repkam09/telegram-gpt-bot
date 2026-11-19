import { beforeEach, describe, expect, it, vi } from "vitest";

const executablePath = vi.fn();
const existsSync = vi.fn();

vi.mock("puppeteer", () => ({ default: { executablePath: () => executablePath() } }));
vi.mock("node:fs", async (importOriginal) => ({ ...(await importOriginal<typeof import("node:fs")>()), existsSync: (p: string) => existsSync(p) }));
vi.mock("../provider", () => ({ resolveLegacyModelProvider: vi.fn() }));

import { checkBrowserInstalled } from "./FetchWebpageContent";
import { Logger } from "../singletons/logger";

beforeEach(() => {
    executablePath.mockReset();
    existsSync.mockReset();
    vi.mocked(Logger.warn).mockClear();
});

describe("checkBrowserInstalled", () => {
    it("is true when the browser executable exists", async () => {
        executablePath.mockResolvedValue("/cache/chrome");
        existsSync.mockReturnValue(true);

        await expect(checkBrowserInstalled()).resolves.toBe(true);
        expect(Logger.warn).not.toHaveBeenCalled();
    });

    it("warns when the executable path does not exist", async () => {
        executablePath.mockResolvedValue("/cache/chrome");
        existsSync.mockReturnValue(false);

        await expect(checkBrowserInstalled()).resolves.toBe(false);
        expect(Logger.warn).toHaveBeenCalledWith("Hennos", expect.stringContaining("npx puppeteer browsers install chrome"));
    });

    it("warns when puppeteer cannot resolve a browser at all", async () => {
        executablePath.mockRejectedValue(new Error("Could not find Chrome"));

        await expect(checkBrowserInstalled()).resolves.toBe(false);
        expect(Logger.warn).toHaveBeenCalled();
    });
});
