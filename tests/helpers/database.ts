import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { Database } from "../../src/database";
import { TEST_DB_TEMPLATE_ENV } from "../global-setup";

/** The chat ID of the account every test database is seeded with. */
export const TEST_CHAT_ID = 0;

export type TestDatabase = {
    /** The Prisma client, also available to application code through Database.instance(). */
    db: PrismaClient;
    /** Delete all rows from all tables, then re-seed the default test account. */
    reset: () => Promise<void>;
    /** Disconnect and delete the database file. Call from afterAll. */
    cleanup: () => Promise<void>;
};

/**
 * Creates an ephemeral SQLite database for the current test file, seeded with a whitelisted user
 * with chatId 0, and initialises the application's Database singleton to use it.
 *
 * The database is a real SQLite file in the OS temp directory (copied from the template created in
 * tests/global-setup.ts) that is removed in cleanup(), so tests exercise the real Prisma schema and queries
 * without any mocking and without leaving state behind.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
    const template = process.env[TEST_DB_TEMPLATE_ENV];
    if (!template) {
        throw new Error(`${TEST_DB_TEMPLATE_ENV} is not set. Is tests/global-setup.ts registered as a vitest globalSetup?`);
    }

    const dir = mkdtempSync(path.join(tmpdir(), "hennos-test-db-"));
    const file = path.join(dir, "test.sqlite");
    copyFileSync(template, file);

    process.env.DATABASE_URL = `file:${file}`;
    await Database.init();
    const db = Database.instance();

    const seed = async () => {
        await db.user.create({
            data: {
                chatId: BigInt(TEST_CHAT_ID),
                firstName: "Test",
                lastName: "User",
                username: "test_user",
                whitelisted: true,
            },
        });
    };

    const reset = async () => {
        const tables = await db.$queryRaw<{ name: string }[]>`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`;
        for (const table of tables) {
            await db.$executeRawUnsafe(`DELETE FROM "${table.name}"`);
        }
        await seed();
    };

    await seed();

    return {
        db,
        reset,
        cleanup: async () => {
            await Database.disconnect();
            delete process.env.DATABASE_URL;
            rmSync(dir, { recursive: true, force: true });
        },
    };
}
