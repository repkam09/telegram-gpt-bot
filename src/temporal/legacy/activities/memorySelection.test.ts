import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MEMORY_CANDIDATE_LIMIT, MEMORY_SELECT_MAX_FILES, memoryCandidates, memoryQuestions, selectMemoryFiles } from "./memorySelection";
import { MemoryFileStore } from "../../../tools/memory/MemoryFileStore";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../../../tests/helpers/database";

const candidates = [
    { path: "/memories/topics/a.md", description: "A" },
    { path: "/memories/topics/b.md", description: "B" },
    { path: "/memories/topics/c.md", description: "C" },
    { path: "/memories/topics/d.md", description: "D" },
];

describe("memoryQuestions", () => {
    it("builds one uniquely named predicate per candidate that mentions its description", () => {
        const questions = memoryQuestions(candidates);

        expect(questions.map((question) => question.name)).toEqual(["memory_file_0", "memory_file_1", "memory_file_2", "memory_file_3"]);
        expect(questions[1].instructions).toContain("B?");
        expect(memoryQuestions([])).toEqual([]);
    });
});

describe("selectMemoryFiles", () => {
    it("keeps only files over the threshold, most confident first, capped", () => {
        const selected = selectMemoryFiles(candidates, { memory_file_0: 0.6, memory_file_1: 0.95, memory_file_2: 0.49, memory_file_3: 0.7 });

        expect(selected).toEqual(["/memories/topics/b.md", "/memories/topics/d.md", "/memories/topics/a.md"]);
        expect(selected.length).toBeLessThanOrEqual(MEMORY_SELECT_MAX_FILES);
    });

    it("selects nothing when no file is confident or answers are missing", () => {
        expect(selectMemoryFiles(candidates, { memory_file_0: 0.2 })).toEqual([]);
        expect(selectMemoryFiles([], {})).toEqual([]);
    });

    it("caps the number of selected files", () => {
        const many = Array.from({ length: 6 }, (_, i) => ({ path: `/memories/topics/${i}.md`, description: String(i) }));
        const probabilities = Object.fromEntries(many.map((_, i) => [`memory_file_${i}`, 0.9]));

        expect(selectMemoryFiles(many, probabilities)).toHaveLength(MEMORY_SELECT_MAX_FILES);
    });
});

describe("memoryCandidates", () => {
    let testDb: TestDatabase;
    const chatId = String(TEST_CHAT_ID);
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

    it("excludes core files and files without a description", async () => {
        await store().create("/memories/profile.md", "---\nname: profile\ndescription: Who\n---\nx");
        await store().create("/memories/preferences.md", "---\nname: p\ndescription: Prefs\n---\nx");
        await store().create("/memories/topics/plain.md", "no frontmatter");
        await store().create("/memories/topics/tea.md", "---\nname: tea\ndescription: Tea habits\n---\nx");

        expect(await memoryCandidates(chatId)).toEqual([{ path: "/memories/topics/tea.md", description: "Tea habits" }]);
    });

    it("limits the candidates to the most recently updated files", async () => {
        for (let i = 0; i < MEMORY_CANDIDATE_LIMIT + 3; i++) {
            await store().create(`/memories/topics/f${i}.md`, `---\nname: f\ndescription: File ${i}\n---\nx`);
            await new Promise((resolve) => setTimeout(resolve, 2));
        }

        const result = await memoryCandidates(chatId);

        expect(result).toHaveLength(MEMORY_CANDIDATE_LIMIT);
        expect(result[0].description).toBe(`File ${MEMORY_CANDIDATE_LIMIT + 2}`);
    });
});
