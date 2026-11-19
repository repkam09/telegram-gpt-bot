// Markdown summary of what a dependency update changed, for the pull request description.
//
//   node scripts/deps-update-summary.mjs [base-ref]      (default base ref: origin/main)
//
// Compares package-lock.json at <base-ref> with the one in the working tree. Direct dependencies (the ones listed in
// package.json) get a table with the version change and its size; everything else is only counted.
// Used by .github/workflows/dependency-update.yml. No third-party dependencies.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "origin/main";

const before = JSON.parse(execFileSync("git", ["show", `${base}:package-lock.json`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })).packages;
const after = JSON.parse(readFileSync("package-lock.json", "utf8")).packages;
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const direct = new Map();
for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const name of Object.keys(pkg[section] ?? {})) direct.set(name, section);
}

const parse = (version) => {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
    return match ? match.slice(1).map(Number) : null;
};

// Size of the change, by semver convention (a 0.x minor bump counts as breaking). Going backwards is called out.
function bump(from, to) {
    const a = parse(from);
    const b = parse(to);
    if (!a || !b) return "unknown";
    for (let i = 0; i < 3; i++) {
        if (b[i] < a[i]) return "downgrade";
        if (b[i] > a[i]) break;
    }
    if (b[0] !== a[0]) return "major";
    if (a[0] === 0 && b[1] !== a[1]) return "major";
    if (b[1] !== a[1]) return "minor";
    if (b[2] !== a[2]) return "patch";
    return "unknown";
}

const topLevel = (lock, name) => lock[`node_modules/${name}`]?.version ?? null;
const lines = [];

const rows = [];
for (const [name, section] of direct) {
    const from = topLevel(before, name);
    const to = topLevel(after, name);
    if (from !== to) rows.push({ name, section, from, to });
}
const order = { major: 0, minor: 1, patch: 2, downgrade: 3, unknown: 4 };
const kind = (row) => (row.from && row.to ? bump(row.from, row.to) : "unknown");
rows.sort((a, b) => order[kind(a)] - order[kind(b)] || a.name.localeCompare(b.name));

lines.push("### Direct dependencies", "");
if (rows.length === 0) {
    lines.push("No direct dependency versions changed; only transitive packages in the lockfile moved.");
} else {
    lines.push("| Package | Section | From | To | Change |", "| --- | --- | --- | --- | --- |");
    for (const row of rows) lines.push(`| \`${row.name}\` | ${row.section} | ${row.from ?? "(new)"} | ${row.to ?? "(removed)"} | ${kind(row)} |`);
}

// Everything else in the lockfile, keyed by install path so nested copies are compared with themselves.
const directPaths = new Set([...direct.keys()].map((name) => `node_modules/${name}`));
const changed = [];
let added = 0;
let removed = 0;
for (const [key, entry] of Object.entries(after)) {
    if (key === "" || directPaths.has(key)) continue;
    if (!(key in before)) added++;
    else if (before[key].version !== entry.version) changed.push(`${key.split("node_modules/").pop()} ${before[key].version} -> ${entry.version}`);
}
for (const key of Object.keys(before)) {
    if (key !== "" && !directPaths.has(key) && !(key in after)) removed++;
}

lines.push("", "### Other packages in the lockfile", "", `${changed.length} updated, ${added} added, ${removed} removed.`);
if (changed.length > 0) {
    const shown = changed.sort().slice(0, 60);
    lines.push("", "<details><summary>Updated transitive packages</summary>", "", ...shown.map((line) => `- ${line}`));
    if (changed.length > shown.length) lines.push(`- ...and ${changed.length - shown.length} more`);
    lines.push("", "</details>");
}

console.log(lines.join("\n"));
