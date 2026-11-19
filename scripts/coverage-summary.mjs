// Prints a Markdown coverage report from coverage/coverage-summary.json (Vitest "json-summary" reporter).
// Used by CI to populate $GITHUB_STEP_SUMMARY: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "coverage", "coverage-summary.json");

if (!existsSync(file)) {
    console.log("## Coverage\n\nNo coverage report was produced.");
    process.exit(0);
}

const summary = JSON.parse(readFileSync(file, "utf8"));
const pct = (metric) => `${metric.pct}% (${metric.covered}/${metric.total})`;

const { total, ...files } = summary;
const lines = [
    "## Coverage",
    "",
    "| Statements | Branches | Functions | Lines |",
    "| --- | --- | --- | --- |",
    `| ${pct(total.statements)} | ${pct(total.branches)} | ${pct(total.functions)} | ${pct(total.lines)} |`,
    "",
    "<details><summary>Per file (lowest line coverage first)</summary>",
    "",
    "| File | Statements | Branches | Functions | Lines |",
    "| --- | --- | --- | --- | --- |",
];

const sorted = Object.entries(files).sort(([, a], [, b]) => a.lines.pct - b.lines.pct);
for (const [name, data] of sorted) {
    const relative = path.relative(process.cwd(), name);
    lines.push(`| \`${relative}\` | ${data.statements.pct}% | ${data.branches.pct}% | ${data.functions.pct}% | ${data.lines.pct}% |`);
}

lines.push("", "</details>");
console.log(lines.join("\n"));
