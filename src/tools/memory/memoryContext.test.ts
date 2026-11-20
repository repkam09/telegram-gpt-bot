import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildMemoryContext, CORE_MEMORY_MAX_CHARS, loadSelectedMemoryFiles, MEMORY_INDEX_MAX_LINES, SELECTED_FILES_MAX_TOTAL_CHARS } from "./memoryContext";
import { MemoryFileStore } from "./MemoryFileStore";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../tests/helpers/database";

const chatId = String(TEST_CHAT_ID);

describe("memoryContext", () => {
    let testDb: TestDatabase;
    const store = () => new MemoryFileStore(chatId);

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
    });

    describe("buildMemoryContext", () => {
        it("is undefined when nothing is stored", async () => {
            expect(await buildMemoryContext(chatId)).toBeUndefined();
        });

        it("puts profile before preferences, then the index of the rest, deterministically", async () => {
            await store().create("/memories/preferences.md", "---\nname: p\ndescription: Prefs\n---\n- [stated] be brief");
            await store().create("/memories/profile.md", "---\nname: profile\ndescription: Who\n---\n- [stated] Name is Sam");
            await store().create("/memories/topics/b.md", "---\nname: b\ndescription: B things\n---\nsecret b body");
            await store().create("/memories/topics/a.md", "---\nname: a\ndescription: A things\n---\nsecret a body");

            const context = (await buildMemoryContext(chatId))!;

            expect(context.indexOf("Name is Sam")).toBeLessThan(context.indexOf("be brief"));
            expect(context.indexOf("topics/a.md: A things")).toBeLessThan(context.indexOf("topics/b.md: B things"));
            expect(context).not.toContain("secret a body");
            expect(context).not.toContain("description: Who");
            expect(await buildMemoryContext(chatId)).toBe(context); // stable between calls, so prompt caching is not disturbed
        });

        it("caps the core block and the index", async () => {
            await store().create("/memories/profile.md", `- [stated] ${"x".repeat(CORE_MEMORY_MAX_CHARS * 2)}`);
            for (let i = 0; i < MEMORY_INDEX_MAX_LINES + 5; i++) {
                await store().create(`/memories/topics/t${String(i).padStart(3, "0")}.md`, `---\nname: t\ndescription: Topic ${i}\n---\nbody`);
            }

            const context = (await buildMemoryContext(chatId))!;

            expect(context).toContain("...(truncated)");
            expect(context).toContain("...and 5 more files");
            expect(context.length).toBeLessThan(CORE_MEMORY_MAX_CHARS + 6000);
        });

        it("lists files without a description by path only", async () => {
            await store().create("/memories/topics/plain.md", "just text");

            expect(await buildMemoryContext(chatId)).toContain("- /memories/topics/plain.md\n");
        });
    });

    describe("loadSelectedMemoryFiles", () => {
        it("returns the file contents without frontmatter, skipping unreadable paths", async () => {
            await store().create("/memories/topics/tea.md", "---\nname: tea\ndescription: Tea\n---\n- [stated] likes oolong");

            const block = (await loadSelectedMemoryFiles(chatId, ["/memories/missing.md", "/memories/topics/tea.md"]))!;

            expect(block).toContain("## /memories/topics/tea.md\n- [stated] likes oolong");
            expect(block).not.toContain("description: Tea");
            expect(block).not.toContain("missing.md");
        });

        it("is undefined when nothing can be read", async () => {
            expect(await loadSelectedMemoryFiles(chatId, ["/memories/missing.md"])).toBeUndefined();
        });

        it("stays within the total budget", async () => {
            for (let i = 0; i < 5; i++) {
                await store().create(`/memories/topics/f${i}.md`, "y".repeat(3000));
            }

            const block = (await loadSelectedMemoryFiles(chatId, [0, 1, 2, 3, 4].map((i) => `/memories/topics/f${i}.md`)))!;

            expect((block.match(/y/g) ?? []).length).toBeLessThanOrEqual(SELECTED_FILES_MAX_TOTAL_CHARS);
        });
    });
});
