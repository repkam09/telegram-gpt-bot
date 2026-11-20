import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryReadTool } from "./MemoryReadTool";
import { MemoryFileStore } from "./memory/MemoryFileStore";
import { createTestDatabase, TEST_CHAT_ID, TestDatabase } from "../../tests/helpers/database";
import { createWorkflowId } from "../temporal/legacy/interface";

describe("MemoryReadTool", () => {
    let testDb: TestDatabase;
    const workflowId = createWorkflowId("test", String(TEST_CHAT_ID));
    const store = () => new MemoryFileStore(String(TEST_CHAT_ID));

    beforeAll(async () => {
        testDb = await createTestDatabase();
    });

    afterAll(async () => {
        await testDb?.cleanup();
    });

    beforeEach(async () => {
        await testDb.reset();
    });

    it("is enabled only when memory exposure is enabled", () => {
        expect(MemoryReadTool.isEnabled()).toBe(false);
        vi.stubEnv("HENNOS_MEMORY_ENABLED", "true");
        expect(MemoryReadTool.isEnabled()).toBe(true);
    });

    it("only offers the view command in its schema", () => {
        const definition = MemoryReadTool.definition();
        expect(definition.function.name).toBe("memory");
        expect(definition.function.parameters?.properties?.command.enum).toEqual(["view"]);
    });

    it("views the directory and files", async () => {
        await store().create("/memories/profile.md", "- [stated] Name is Sam");

        const [listing] = await MemoryReadTool.callback(workflowId, { command: "view" }, null);
        const [file] = await MemoryReadTool.callback(workflowId, { command: "view", path: "/memories/profile.md" }, null);

        expect(listing).toContain("/memories/profile.md");
        expect(file).toContain("Name is Sam");
    });

    it.each([
        { command: "create", path: "/memories/new.md", file_text: "x" },
        { command: "str_replace", path: "/memories/profile.md", old_str: "Sam", new_str: "Alex" },
        { command: "insert", path: "/memories/profile.md", insert_line: 0, insert_text: "x" },
        { command: "delete", path: "/memories/profile.md" },
        { command: "rename", old_path: "/memories/profile.md", new_path: "/memories/other.md" },
    ])("rejects the write command $command and changes nothing", async (args) => {
        await store().create("/memories/profile.md", "- [stated] Name is Sam");

        const [result] = await MemoryReadTool.callback(workflowId, args, null);

        expect(result).toContain("read-only");
        expect((await store().listFiles()).map((file) => file.path)).toEqual(["/memories/profile.md"]);
        expect(await store().readRaw("/memories/profile.md")).toBe("- [stated] Name is Sam");
    });
});
