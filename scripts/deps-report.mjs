// Dependency health report: outdated packages, a security audit, and dependencies nothing seems to use.
//
//   node scripts/deps-report.mjs [output-dir]      (default output dir: deps-report)
//
// Writes report.json (machine readable, meant to be read by a person or an agent) and report.md (human summary).
// Used by .github/workflows/dependency-report.yml. Run it after `npm ci` so the bin check below can see node_modules.
//
// Deliberately has no third-party dependencies, so it adds no supply-chain surface and never needs `npx`.
// Every section is best effort: a failing section is recorded under "errors" instead of aborting the report.
// The exit code is 0 unless the script itself crashes; this is a report, not a gate.
import { spawnSync } from "node:child_process";
import { builtinModules } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.resolve(root, process.argv[2] ?? "deps-report");
const errors = [];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const pkg = readJson(path.join(root, "package.json"));

// The report is only meaningful under the Node (and so npm) the repo pins: an older npm ignores `.npmrc` settings such as
// `min-release-age`, which makes "wanted"/"latest" misleading. Refuse to run on a mismatch rather than write a wrong report.
// `.nvmrc` may hold a partial version ("26", "26.9"), so compare only the components it specifies.
function checkNodeVersion() {
    const file = path.join(root, ".nvmrc");
    if (!existsSync(file)) return;
    const expected = readFileSync(file, "utf8").trim().replace(/^v/, "");
    const wanted = expected.split(".");
    const actual = process.versions.node.split(".");
    if (!/^\d+(\.\d+){0,2}$/.test(expected)) return; // aliases such as "lts/*" cannot be compared here
    if (wanted.every((part, i) => part === actual[i])) return;
    console.error(`deps-report: running on Node ${process.versions.node}, but .nvmrc requires ${expected}. Switch Node (for example \`nvm use\`) and run it again.`);
    process.exit(1);
}
checkNodeVersion();

const manifest = new Map();
for (const type of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const name of Object.keys(pkg[type] ?? {})) {
        manifest.set(name, type);
    }
}

function run(command, args) {
    // Put the running Node's bin directory first so `npm` (and anything it spawns) belongs to the same install as this process,
    // not whichever Node happens to come first on the default PATH. This is also what keeps `.npmrc` settings such as `min-release-age` honoured.
    const env = { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) };
    const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}

function parseVersion(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
    return match ? match.slice(1).map(Number) : null;
}

// How big a jump is it from `current` to `latest`? A 0.x minor bump counts as breaking, per semver convention.
// "downgrade" means the registry's latest tag is older than what is installed (a stale or moved dist-tag), not an update.
function bumpKind(current, latest) {
    const a = parseVersion(current);
    const b = parseVersion(latest);
    if (!a || !b) return "unknown";
    for (let i = 0; i < 3; i++) {
        if (b[i] < a[i]) return "downgrade";
        if (b[i] > a[i]) break;
    }
    if (b[0] !== a[0]) return "major";
    if (a[0] === 0 && b[1] !== a[1]) return "major";
    if (b[1] !== a[1]) return "minor";
    if (b[2] !== a[2]) return "patch";
    return "none";
}

// --- Outdated -------------------------------------------------------------------------------------------------
// `npm outdated` exits 1 when anything is outdated, so success is judged by whether the output parses, not the exit code.
function collectOutdated() {
    const result = run("npm", ["outdated", "--json", "--long"]);
    let parsed;
    try {
        parsed = result.stdout.trim() ? JSON.parse(result.stdout) : {};
    } catch {
        errors.push({ section: "outdated", message: (result.stderr || result.stdout || String(result.error)).slice(0, 2000) });
        return null;
    }
    if (parsed.error) {
        errors.push({ section: "outdated", message: JSON.stringify(parsed.error).slice(0, 2000) });
        return null;
    }
    const order = { major: 0, minor: 1, patch: 2, unknown: 3, downgrade: 4, none: 5 };
    return Object.entries(parsed)
        .map(([name, info]) => ({
            name,
            type: manifest.get(name) ?? "transitive",
            current: info.current ?? null,
            wanted: info.wanted ?? null,
            latest: info.latest ?? null,
            bump: bumpKind(info.current, info.latest),
            // Version the range in package.json already allows (`npm update` would take it without editing package.json).
            withinRange: Boolean(info.current && info.wanted && info.current !== info.wanted),
        }))
        .sort((a, b) => order[a.bump] - order[b.bump] || a.name.localeCompare(b.name));
}

// --- Audit ----------------------------------------------------------------------------------------------------
function collectAudit() {
    const result = run("npm", ["audit", "--json"]);
    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        errors.push({ section: "audit", message: (result.stderr || result.stdout || String(result.error)).slice(0, 2000) });
        return null;
    }
    if (parsed.error) {
        errors.push({ section: "audit", message: JSON.stringify(parsed.error).slice(0, 2000) });
        return null;
    }
    const vulnerabilities = Object.entries(parsed.vulnerabilities ?? {}).map(([name, v]) => ({
        name,
        severity: v.severity,
        direct: Boolean(v.isDirect),
        range: v.range,
        fixAvailable: typeof v.fixAvailable === "object" ? { name: v.fixAvailable.name, version: v.fixAvailable.version, majorBump: Boolean(v.fixAvailable.isSemVerMajor) } : Boolean(v.fixAvailable),
    }));
    return { counts: parsed.metadata?.vulnerabilities ?? {}, vulnerabilities };
}

// --- Unused ---------------------------------------------------------------------------------------------------
const SKIP_DIRS = new Set(["node_modules", ".git", "build", "coverage", "deps-report", "migrations"]);
const SCAN_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".sh", ".toml"]);
const SCAN_NAMES = new Set(["Dockerfile", ".npmrc"]);
const SKIP_FILES = new Set(["package.json", "package-lock.json"]);

function walk(dir, files = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
        } else if (!SKIP_FILES.has(entry.name) && (SCAN_EXT.has(path.extname(entry.name)) || SCAN_NAMES.has(entry.name) || /^\.eslintrc/.test(entry.name))) {
            files.push(path.join(dir, entry.name));
        }
    }
    return files;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function binsOf(name) {
    const file = path.join(root, "node_modules", name, "package.json");
    if (!existsSync(file)) return null;
    const { bin } = readJson(file);
    if (!bin) return [];
    return typeof bin === "string" ? [name.split("/").pop()] : Object.keys(bin);
}

function collectUnused() {
    const files = walk(root).map((file) => ({ file: path.relative(root, file), text: readFileSync(file, "utf8") }));
    const scriptsText = Object.values(pkg.scripts ?? {}).join("\n");
    // Everything that could invoke a tool by command name: package.json scripts, CI workflows, shell scripts, Dockerfile.
    const commandText = [scriptsText, ...files.filter((f) => /\.(ya?ml|sh)$|Dockerfile/.test(f.file)).map((f) => f.text)].join("\n");
    const configText = files.filter((f) => /eslint|vitest|tsconfig|prisma|\.config\./i.test(f.file)).map((f) => f.text).join("\n");

    const evidenceFor = (name) => {
        const evidence = [];
        const reference = new RegExp(`['"\`/]${escapeRegExp(name)}(['"\`/]|$)`, "m");
        const hit = files.find((f) => reference.test(f.text));
        if (hit) evidence.push(`referenced in ${hit.file}`);

        const bins = binsOf(name);
        const binHit = (bins ?? []).find((bin) => new RegExp(`(^|[\\s;&|"'/])${escapeRegExp(bin)}([\\s;&|"']|$)`, "m").test(commandText));
        if (binHit) evidence.push(`bin "${binHit}" is run by a script or CI`);

        // @types/foo and @types/scope__foo are used when the package they describe is. @types/node covers `node:` imports and globals.
        if (name.startsWith("@types/")) {
            const target = name.slice("@types/".length);
            const real = target.includes("__") ? `@${target.replace("__", "/")}` : target;
            if (real === "node" || manifest.has(real) || builtinModules.includes(real)) evidence.push(`types for "${real}"`);
        }

        // ESLint plugins/parsers are loaded by name from the config, not imported.
        const eslintMatch = /^(@[^/]+)\/eslint-plugin$/.exec(name) ?? /^eslint-plugin-(.+)$/.exec(name);
        if (eslintMatch && new RegExp(`${escapeRegExp(eslintMatch[1])}`).test(configText)) evidence.push("named in the ESLint config");

        // @vitest/coverage-istanbul is selected by `provider: "istanbul"`.
        const coverage = /^@vitest\/coverage-(.+)$/.exec(name);
        if (coverage && new RegExp(`provider:\\s*["']${escapeRegExp(coverage[1])}["']`).test(configText)) evidence.push(`coverage provider "${coverage[1]}" in vitest config`);

        return { evidence, binsChecked: bins !== null };
    };

    const unused = [];
    const used = {};
    let binCheckSkipped = 0;
    for (const [name, type] of manifest) {
        const { evidence, binsChecked } = evidenceFor(name);
        if (!binsChecked) binCheckSkipped++;
        if (evidence.length > 0) used[name] = evidence;
        else unused.push({ name, type, binCheckSkipped: !binsChecked });
    }
    if (binCheckSkipped > 0) {
        errors.push({ section: "unused", message: `node_modules was missing for ${binCheckSkipped} package(s), so command-line tools could not be matched; run \`npm ci\` first or expect false positives.` });
    }
    return { unused, usedCount: Object.keys(used).length, checked: manifest.size };
}

// --- Assemble -------------------------------------------------------------------------------------------------
const npmrc = existsSync(path.join(root, ".npmrc")) ? readFileSync(path.join(root, ".npmrc"), "utf8") : "";
const git = run("git", ["rev-parse", "HEAD"]);

const report = {
    generatedAt: new Date().toISOString(),
    commit: git.status === 0 ? git.stdout.trim() : null,
    node: process.version,
    npm: run("npm", ["--version"]).stdout.trim(),
    // `min-release-age` in .npmrc means brand-new releases are not installable yet; "latest" below may include ones that are.
    npmrc: Object.fromEntries(npmrc.split("\n").filter((line) => line.includes("=") && !line.startsWith("#")).map((line) => line.split("=").map((part) => part.trim()))),
    outdated: collectOutdated(),
    audit: collectAudit(),
    unusedDependencies: collectUnused(),
    notes: [
        "unusedDependencies is a heuristic (static references, bins used by scripts/CI, @types and plugin conventions). Packages loaded in ways it cannot see (dynamic strings, runtime plugins) can appear here; confirm with the build and tests before removing.",
        "outdated lists direct and transitive packages npm reports; entries with type \"transitive\" are only shown when npm lists them and usually need no action.",
    ],
    errors,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

const table = (headers, rows) => [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)];
const md = ["# Dependency report", "", `Generated ${report.generatedAt} for \`${(report.commit ?? "unknown").slice(0, 7)}\` on Node ${report.node}, npm ${report.npm}.`, ""];

md.push("## Unused dependencies", "");
const unusedList = report.unusedDependencies.unused;
md.push(...(unusedList.length ? table(["Package", "Section"], unusedList.map((u) => [`\`${u.name}\``, u.type])) : ["None found."]), "");

md.push("## Outdated", "");
const direct = (report.outdated ?? []).filter((o) => o.type !== "transitive");
if (report.outdated === null) md.push("Could not be determined (see errors).");
else if (direct.length === 0) md.push("All direct dependencies are up to date.");
else md.push(...table(["Package", "Section", "Current", "Wanted", "Latest", "Bump"], direct.map((o) => [`\`${o.name}\``, o.type, o.current ?? "-", o.wanted ?? "-", o.latest ?? "-", o.bump])), "", "`downgrade` means the registry's latest tag is older than the installed version, so there is nothing to update.");
md.push("");

md.push("## Security audit", "");
if (report.audit === null) md.push("Could not be determined (see errors).");
else {
    const counts = Object.entries(report.audit.counts).filter(([key]) => key !== "total").map(([key, value]) => `${value} ${key}`).join(", ");
    md.push(report.audit.vulnerabilities.length ? `${counts}.` : "No known vulnerabilities.");
    if (report.audit.vulnerabilities.length) {
        md.push("", ...table(["Package", "Severity", "Direct", "Fix"], report.audit.vulnerabilities.map((v) => [`\`${v.name}\``, v.severity, v.direct ? "yes" : "no", typeof v.fixAvailable === "object" ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.majorBump ? " (major)" : ""}` : v.fixAvailable ? "yes" : "no"])));
    }
}
md.push("");

if (errors.length) md.push("## Errors", "", ...errors.map((e) => `- **${e.section}**: ${e.message.split("\n")[0].slice(0, 300)}`), "");
writeFileSync(path.join(outDir, "report.md"), `${md.join("\n")}\n`);

console.log(`Wrote ${path.relative(root, path.join(outDir, "report.json"))} and report.md`);
