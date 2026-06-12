import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { MemoryFileStore, normalizeMemoryPath, humanReadableSize } from "./MemoryFileStore";
import { runMemoryCommand, memoryScopeFromWorkflowId } from "../MemoryTool";

describe("normalizeMemoryPath", () => {
    it("accepts valid paths within /memories", () => {
        expect(normalizeMemoryPath("/memories")).toBe("/memories");
        expect(normalizeMemoryPath("/memories/notes.txt")).toBe("/memories/notes.txt");
        expect(normalizeMemoryPath("/memories/projects/bot.md")).toBe("/memories/projects/bot.md");
        expect(normalizeMemoryPath("memories/notes.txt")).toBe("/memories/notes.txt");
        expect(normalizeMemoryPath("/memories//double//slash.txt")).toBe("/memories/double/slash.txt");
    });

    it("rejects traversal attempts", () => {
        expect(normalizeMemoryPath("/memories/../etc/passwd")).toBeNull();
        expect(normalizeMemoryPath("/memories/..")).toBeNull();
        expect(normalizeMemoryPath("../memories/notes.txt")).toBeNull();
        expect(normalizeMemoryPath("/memories/%2e%2e/escape.txt")).toBeNull();
        expect(normalizeMemoryPath("/memories/..\\windows.txt")).toBeNull();
    });

    it("rejects paths outside /memories", () => {
        expect(normalizeMemoryPath("/etc/passwd")).toBeNull();
        expect(normalizeMemoryPath("/memoriesx/notes.txt")).toBeNull();
        expect(normalizeMemoryPath("/")).toBeNull();
        expect(normalizeMemoryPath("")).toBeNull();
        expect(normalizeMemoryPath(undefined)).toBeNull();
        expect(normalizeMemoryPath(42)).toBeNull();
    });

    it("rejects hidden segments", () => {
        expect(normalizeMemoryPath("/memories/.hidden")).toBeNull();
        expect(normalizeMemoryPath("/memories/.config/data.txt")).toBeNull();
    });
});

describe("humanReadableSize", () => {
    it("formats sizes like du", () => {
        expect(humanReadableSize(512)).toBe("512B");
        expect(humanReadableSize(1536)).toBe("1.5K");
        expect(humanReadableSize(1024 * 1024 * 2)).toBe("2.0M");
    });
});

describe("memoryScopeFromWorkflowId", () => {
    it("extracts chatId from agent workflowIds", () => {
        const workflowId = JSON.stringify({ platform: "telegram", chatId: "12345", type: "agent" });
        expect(memoryScopeFromWorkflowId(workflowId)).toBe("12345");
    });

    it("falls back to the raw workflowId", () => {
        expect(memoryScopeFromWorkflowId("not-json")).toBe("not-json");
    });
});

describe("MemoryFileStore", () => {
    let prisma: PrismaClient;
    let store: MemoryFileStore;
    let tempDir: string;

    beforeAll(() => {
        tempDir = mkdtempSync(path.join(tmpdir(), "hennos-memory-test-"));
        const url = `file:${path.join(tempDir, "test.sqlite")}`;
        execSync("npx prisma db push --skip-generate", {
            cwd: path.join(__dirname, "../../.."),
            env: { ...process.env, DATABASE_URL: url },
            stdio: "pipe"
        });
        prisma = new PrismaClient({ datasources: { db: { url } } });
    });

    afterAll(async () => {
        await prisma?.$disconnect();
        rmSync(tempDir, { recursive: true, force: true });
    });

    beforeEach(async () => {
        await prisma.memoryFile.deleteMany({});
        store = new MemoryFileStore("test-chat", prisma);
    });

    describe("create", () => {
        it("creates a file", async () => {
            const result = await store.create("/memories/notes.txt", "Hello World");
            expect(result).toBe("File created successfully at: /memories/notes.txt");
        });

        it("errors when the file already exists", async () => {
            await store.create("/memories/notes.txt", "Hello");
            const result = await store.create("/memories/notes.txt", "Again");
            expect(result).toBe("Error: File /memories/notes.txt already exists");
        });

        it("errors when an ancestor is a file", async () => {
            await store.create("/memories/notes", "I am a file");
            const result = await store.create("/memories/notes/nested.txt", "content");
            expect(result).toContain("is a file, not a directory");
        });

        it("rejects invalid paths", async () => {
            const result = await store.create("/memories/../escape.txt", "content");
            expect(result).toContain("Error: Invalid path");
        });

        it("rejects oversized content", async () => {
            const result = await store.create("/memories/big.txt", "x".repeat(64 * 1024));
            expect(result).toContain("exceeds the maximum size");
        });
    });

    describe("view", () => {
        it("shows file contents with line numbers", async () => {
            await store.create("/memories/notes.txt", "Hello World\nThis is line two");
            const result = await store.view("/memories/notes.txt");
            expect(result).toBe("Here's the content of /memories/notes.txt with line numbers:\n     1\tHello World\n     2\tThis is line two");
        });

        it("supports view_range", async () => {
            await store.create("/memories/notes.txt", "one\ntwo\nthree\nfour");
            const result = await store.view("/memories/notes.txt", [2, 3]);
            expect(result).toBe("Here's the content of /memories/notes.txt with line numbers:\n     2\ttwo\n     3\tthree");
        });

        it("lists the root directory with sizes", async () => {
            await store.create("/memories/notes.txt", "x".repeat(2048));
            await store.create("/memories/projects/bot.md", "y".repeat(512));
            const result = await store.view("/memories");
            expect(result).toContain("Here're the files and directories up to 2 levels deep in /memories, excluding hidden items and node_modules:");
            expect(result).toContain("2.5K\t/memories");
            expect(result).toContain("2.0K\t/memories/notes.txt");
            expect(result).toContain("512B\t/memories/projects");
            expect(result).toContain("512B\t/memories/projects/bot.md");
        });

        it("lists an empty root without error", async () => {
            const result = await store.view("/memories");
            expect(result).toContain("up to 2 levels deep in /memories");
            expect(result).toContain("0B\t/memories");
        });

        it("rolls deep files up into level-2 directories", async () => {
            await store.create("/memories/a/b/c/deep.txt", "deep");
            const result = await store.view("/memories");
            expect(result).toContain("/memories/a/b");
            expect(result).not.toContain("/memories/a/b/c");
        });

        it("errors for missing paths", async () => {
            const result = await store.view("/memories/missing.txt");
            expect(result).toBe("The path /memories/missing.txt does not exist. Please provide a valid path.");
        });
    });

    describe("str_replace", () => {
        it("replaces a unique string", async () => {
            await store.create("/memories/prefs.txt", "Favorite color: blue\nFavorite food: pizza");
            const result = await store.strReplace("/memories/prefs.txt", "Favorite color: blue", "Favorite color: green");
            expect(result).toContain("The memory file has been edited.");
            expect(result).toContain("Favorite color: green");

            const view = await store.view("/memories/prefs.txt");
            expect(view).toContain("Favorite color: green");
        });

        it("errors when old_str is not found", async () => {
            await store.create("/memories/prefs.txt", "Hello");
            const result = await store.strReplace("/memories/prefs.txt", "missing", "new");
            expect(result).toBe("No replacement was performed, old_str `missing` did not appear verbatim in /memories/prefs.txt.");
        });

        it("errors when old_str appears multiple times", async () => {
            await store.create("/memories/prefs.txt", "dup\nother\ndup");
            const result = await store.strReplace("/memories/prefs.txt", "dup", "new");
            expect(result).toBe("No replacement was performed. Multiple occurrences of old_str `dup` in lines: 1, 3. Please ensure it is unique");
        });

        it("errors for missing files", async () => {
            const result = await store.strReplace("/memories/missing.txt", "a", "b");
            expect(result).toBe("Error: The path /memories/missing.txt does not exist. Please provide a valid path.");
        });
    });

    describe("insert", () => {
        it("inserts text after the given line", async () => {
            await store.create("/memories/todo.txt", "- item one\n- item two");
            const result = await store.insert("/memories/todo.txt", 1, "- inserted item");
            expect(result).toBe("The file /memories/todo.txt has been edited.");

            const view = await store.view("/memories/todo.txt");
            expect(view).toContain("     1\t- item one\n     2\t- inserted item\n     3\t- item two");
        });

        it("inserts at the beginning with line 0", async () => {
            await store.create("/memories/todo.txt", "existing");
            await store.insert("/memories/todo.txt", 0, "first");
            const view = await store.view("/memories/todo.txt");
            expect(view).toContain("     1\tfirst\n     2\texisting");
        });

        it("errors on out-of-range line numbers", async () => {
            await store.create("/memories/todo.txt", "one\ntwo");
            const result = await store.insert("/memories/todo.txt", 10, "text");
            expect(result).toBe("Error: Invalid `insert_line` parameter: 10. It should be within the range of lines of the file: [0, 2]");
        });

        it("errors for missing files", async () => {
            const result = await store.insert("/memories/missing.txt", 0, "text");
            expect(result).toBe("Error: The path /memories/missing.txt does not exist");
        });
    });

    describe("delete", () => {
        it("deletes a file", async () => {
            await store.create("/memories/old.txt", "stale");
            const result = await store.delete("/memories/old.txt");
            expect(result).toBe("Successfully deleted /memories/old.txt");
            expect(await store.view("/memories/old.txt")).toContain("does not exist");
        });

        it("deletes a directory recursively", async () => {
            await store.create("/memories/proj/a.txt", "a");
            await store.create("/memories/proj/sub/b.txt", "b");
            const result = await store.delete("/memories/proj");
            expect(result).toBe("Successfully deleted /memories/proj");
            expect(await store.view("/memories/proj/a.txt")).toContain("does not exist");
        });

        it("refuses to delete the root", async () => {
            const result = await store.delete("/memories");
            expect(result).toContain("Cannot delete");
        });

        it("errors for missing paths", async () => {
            const result = await store.delete("/memories/missing.txt");
            expect(result).toBe("Error: The path /memories/missing.txt does not exist");
        });
    });

    describe("rename", () => {
        it("renames a file", async () => {
            await store.create("/memories/draft.txt", "content");
            const result = await store.rename("/memories/draft.txt", "/memories/final.txt");
            expect(result).toBe("Successfully renamed /memories/draft.txt to /memories/final.txt");
            expect(await store.view("/memories/final.txt")).toContain("content");
        });

        it("renames a directory and its contents", async () => {
            await store.create("/memories/old-proj/a.txt", "a");
            await store.create("/memories/old-proj/sub/b.txt", "b");
            const result = await store.rename("/memories/old-proj", "/memories/new-proj");
            expect(result).toBe("Successfully renamed /memories/old-proj to /memories/new-proj");
            expect(await store.view("/memories/new-proj/sub/b.txt")).toContain("b");
        });

        it("refuses to overwrite an existing destination", async () => {
            await store.create("/memories/a.txt", "a");
            await store.create("/memories/b.txt", "b");
            const result = await store.rename("/memories/a.txt", "/memories/b.txt");
            expect(result).toBe("Error: The destination /memories/b.txt already exists");
        });

        it("errors for missing sources", async () => {
            const result = await store.rename("/memories/missing.txt", "/memories/dest.txt");
            expect(result).toBe("Error: The path /memories/missing.txt does not exist");
        });
    });

    describe("chat isolation", () => {
        it("does not leak memory between chats", async () => {
            await store.create("/memories/secret.txt", "chat one data");

            const otherStore = new MemoryFileStore("other-chat", prisma);
            const result = await otherStore.view("/memories/secret.txt");
            expect(result).toContain("does not exist");

            const listing = await otherStore.view("/memories");
            expect(listing).not.toContain("secret.txt");
        });
    });

    describe("runMemoryCommand", () => {
        it("dispatches commands from tool args", async () => {
            const created = await runMemoryCommand(store, { command: "create", path: "/memories/notes.txt", file_text: "Hello" });
            expect(created).toBe("File created successfully at: /memories/notes.txt");

            const viewed = await runMemoryCommand(store, { command: "view", path: "/memories/notes.txt" });
            expect(viewed).toContain("Hello");
        });

        it("defaults view to the memory root", async () => {
            const result = await runMemoryCommand(store, { command: "view" });
            expect(result).toContain("up to 2 levels deep in /memories");
        });

        it("rejects unknown commands", async () => {
            const result = await runMemoryCommand(store, { command: "explode" });
            expect(result).toContain("Unknown memory command");
        });
    });
});
