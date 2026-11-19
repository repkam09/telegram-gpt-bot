import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Environment variable that points at a freshly migrated, empty SQLite database file.
 * Each test file copies this template (see tests/helpers/database.ts) so that every
 * file gets its own ephemeral database without paying for `prisma db push` repeatedly.
 */
export const TEST_DB_TEMPLATE_ENV = "TEST_DB_TEMPLATE_PATH";

/**
 * Runs once per `vitest` invocation, before any test file. Builds the template database from
 * prisma/schema.prisma. Requires the Prisma client to be generated (`npm run prisma:generate`).
 */
export default function setup(): () => void {
    const root = path.resolve(__dirname, "..");
    const dir = mkdtempSync(path.join(tmpdir(), "hennos-test-template-"));
    const file = path.join(dir, "template.sqlite");

    // Invoke the locally installed Prisma CLI directly (no npx lookup).
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "db", "push", "--skip-generate"], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: `file:${file}` },
        stdio: "pipe",
    });

    process.env[TEST_DB_TEMPLATE_ENV] = file;

    return () => {
        rmSync(dir, { recursive: true, force: true });
    };
}
