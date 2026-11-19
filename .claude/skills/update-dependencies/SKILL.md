---
name: update-dependencies
description: Update npm dependencies and remove unused ones for this repo, driven by the weekly dependency report. Use when asked to update, upgrade, audit, or clean up npm dependencies or package.json.
---

# Update dependencies

Turn the weekly dependency report into a reviewed pull request. The report is produced by
[scripts/deps-report.mjs](../../../scripts/deps-report.mjs) via
[.github/workflows/dependency-report.yml](../../../.github/workflows/dependency-report.yml) and published to the
`deps-report` branch. It is report-only: the update itself is done here, on a feature branch.

## 1. Read the report

```bash
git fetch origin deps-report && git show FETCH_HEAD:report.json
```

Fields: `outdated[]` (`name`, `type`, `current`, `wanted`, `latest`, `bump` = major/minor/patch, or `downgrade` when the registry's latest tag is older than what is installed, which needs no action; `withinRange`),
`audit` (`counts`, `vulnerabilities[]` with `fixAvailable`), `unusedDependencies.unused[]`, `errors[]`, plus the
`commit` and `generatedAt` it describes.

- If the branch does not exist, or `commit`/`generatedAt` is clearly stale, trigger a fresh run:
  `gh api repos/repkam09/telegram-gpt-bot/actions/workflows/dependency-report.yml/dispatches -f ref=main`
  (needs the workflow on `main`), or ask the owner to use Actions, Dependency report, Run workflow.
  Do not fall back to guessing versions from memory.
- If `errors[]` says a section failed, say so and treat that section as unknown.

## 2. Run the update workflow (preferred)

[.github/workflows/dependency-update.yml](../../../.github/workflows/dependency-update.yml) does the update on GitHub's
runners (Node 26, registry access), validates the new branch with the regular CI workflow, and opens the pull request,
as a draft when CI fails. A session here usually has neither the registry nor Node 26, so use the workflow instead of
editing the lockfile yourself.

```bash
gh workflow run dependency-update.yml -f mode=in-range
gh workflow run dependency-update.yml -f mode=major -f packages="prisma @prisma/client"
# if `gh workflow run` is not available:
gh api repos/repkam09/telegram-gpt-bot/actions/workflows/dependency-update.yml/dispatches -f ref=main -f 'inputs[mode]=in-range'
```

If neither works from this session, ask the owner to run it from the Actions tab (Dependency update, Run workflow).

Order of work:

1. **`in-range` first.** Lockfile only, low risk, and it resolves mismatches such as the `prisma` CLI being behind `@prisma/client`.
2. **Then `major`, one package family per run**, taken from `outdated` entries with `bump: major`. Packages that move together go in
   the same run: the `@temporalio/*` set, `prisma` with `@prisma/client`, `llamaindex` with the `@llamaindex/*` packages,
   `@typescript-eslint/*`, `vitest` with `@vitest/*`. Read the changelog or migration notes first.
3. Fix `audit.vulnerabilities` before routine updates when the fix is not a major bump.

Follow a run with `gh run list --workflow dependency-update.yml --limit 1` and `gh run view <id>`. The branches are named
`deps/<mode>-<date>-<run id>`; find the PR with
`gh api repos/repkam09/telegram-gpt-bot/pulls --jq '.[] | select(.head.ref | startswith("deps/")) | .html_url'`
(`gh pr list` needs GraphQL, which this environment blocks).

**If CI failed**, the PR is a draft. Read the failing job's log (`gh api repos/repkam09/telegram-gpt-bot/actions/runs/<run id>/jobs`,
then `.../actions/jobs/<job id>/logs`), fix the cause on that branch (source or test changes for a breaking upgrade, or hold the
package back), and push. A push from this session starts the normal CI on the PR. Never hand-edit versions or integrity hashes in
`package-lock.json`; if the fix needs a different version set, run the workflow again with the right `packages`. If it cannot be
fixed, leave the draft with a comment saying which package blocks and why.

Repository setting needed once: Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests".
Without it the branch is pushed but the PR step fails with a message saying so.

## 3. Fallback: update from this session

Only when the workflow cannot be used. Real updates need the npm registry and Node 26 (see `.nvmrc` and `engines`; `.npmrc` sets `engine-strict`).
Check with `node -v` and `npm view typescript version`. Sessions without network access can still:

- remove dependencies and edit the lockfile offline:
  `npm uninstall <pkgs> --package-lock-only --offline --ignore-scripts --engine-strict=false`
- nothing else reliably. Never hand-edit `package-lock.json` versions or integrity hashes, and do not claim that anything was built or tested when it was not.

If version updates are blocked, still do the removals, open that PR, and say plainly what is left and why.

## 4. Make the changes on a feature branch

Never commit to `main`. Use separate commits (and ideally separate PRs) for each of these:

1. **Unused dependencies**: `unusedDependencies.unused` is a heuristic. Before removing a package, grep for it by name
   (dynamic strings, `target:`/`provider:` style config, Dockerfile, CI, `scripts/`). Prisma, `@types/*`, ESLint plugins and
   vitest coverage providers are loaded by convention rather than imported.
2. **Patch and minor updates** together.
3. **Each major update on its own**, with its changelog or migration notes read first, so a failure is easy to attribute.
   Packages that move together (the `@temporalio/*` set, `prisma` with `@prisma/client`, the `llamaindex` and `@llamaindex/*`
   set, `@typescript-eslint/*`, `vitest` with `@vitest/*`) go in the same step and the same version line.
4. **Security fixes** (`audit.vulnerabilities`) first when the fix is not a major bump; call out the rest.

Keep to the existing range style in `package.json`. `.npmrc` sets `min-release-age`, so a release newer than the limit
will not install; that is expected, so use the newest allowed version and note it.

Update with `npm install <pkg>@<version>` (or edit `package.json` and `npm install`) so the lockfile is regenerated by npm.

## 5. Verify

`.npmrc` sets `ignore-scripts=true`, so generate the Prisma client explicitly. Then, in this order:

```bash
npm ci
npm run prisma:generate
npm run lint:check
npm run tsc:noemit
npm run tsc:test
npm run tsc:emit
npm test
```

Do not use `npm run lint` for verification (it runs `eslint --fix`). If a step fails after an update, fix it or revert
that package and report it. Never silence lint or type errors to get green.

Temporal workflow code is replayed from history, so also check that no change alters workflow determinism (see
`.claude/rules/temporal-workflow.md`).

## 6. Open the pull request

Push the branch and open a PR against `main` for the owner to review. Include a table of what changed
(package, from, to, bump size), anything held back and why, what was verified and where, and the report `commit` it was based on.
If `gh pr create` fails with a GraphQL 403, use the REST API instead:

```bash
gh api repos/repkam09/telegram-gpt-bot/pulls -f title='...' -f head='<branch>' -f base='main' -F body=@body.md --jq .html_url
```

Give the owner the PR link. Do not merge it.
