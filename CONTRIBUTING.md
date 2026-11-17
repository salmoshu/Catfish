# Contributing Guide

> **Chinese version**: [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)

## Prerequisites

See [docs/contributing/development.md](docs/contributing/development.md) for environment setup. You will need:

- Node.js 22+
- [bun](https://bun.sh)
- [Rust stable + Cargo](https://rustup.rs) for the local AionCore backend
- [prek](https://github.com/j178/prek) (`npm install -g @j178/prek`)

## Rule 1: Atomic PRs

Each pull request must contain **exactly one feature or one bug fix** that cannot be further decomposed.

**How to check:** Ask yourself (or an AI): _"Can this diff be split into multiple independently mergeable PRs?"_ If yes, split it before submitting.

### Examples

**Acceptable (single PR):**

- A bug fix with one root cause, even if it touches multiple files (e.g., fixing toast z-index across modal and chat layers)
- A single coherent feature (e.g., team creation modal with form validation)

**Must be split into separate PRs:**

- Team chat scroll fix + Sentry user tracking + office preview performance optimization = 3 PRs
- Unrelated bug fixes bundled together (e.g., titlebar navigation fix + i18n missing key + speech input UI fix)
- Independent technical layers (e.g., IPC bridge refactor + renderer component + worker process change for unrelated features)

## Rule 2: Commit and PR Title Format

Commit messages and PR titles must use Conventional Commit format in English:

```text
<type>(<scope>): <subject>
```

Use one of these types:

| Type       | Meaning                  | Changelog visibility |
| ---------- | ------------------------ | -------------------- |
| `feat`     | New user-facing behavior | Visible              |
| `fix`      | Bug fix                  | Visible              |
| `perf`     | Performance improvement  | Visible              |
| `refactor` | Code restructuring       | Visible              |
| `docs`     | Documentation            | Visible              |
| `style`    | Formatting or styles     | Hidden               |
| `chore`    | Maintenance work         | Hidden               |
| `test`     | Tests                    | Hidden               |
| `ci`       | CI configuration         | Hidden               |
| `build`    | Build system             | Hidden               |

Examples:

- `fix(preview): restore local html loading`
- `feat(workspace): add file preview shortcuts`
- `docs(contributing): document pr title format`

## Rule 3: Pass Local Checks Before Push

CI will reject your PR if these checks fail. Run them locally **before pushing** to save time.

### Step-by-step

```bash
# 1. Format (always run — covers .ts, .tsx, .css, .json, .md)
bun run format

# 2. Lint (skip if no .ts/.tsx files changed)
bun run lint

# 3. Type check (skip if no .ts/.tsx files changed)
bunx tsc --noEmit

# 4. i18n validation (only if you changed files in src/renderer/, locales/, or src/common/config/i18n/)
bun run i18n:types
node scripts/check-i18n.js

# 5. Tests
bunx vitest run
```

### One-command alternative

This replicates the exact CI quality check, then runs tests:

```bash
prek run --from-ref origin/main --to-ref HEAD
bunx vitest run
```

> `prek` runs format-check + lint + tsc in read-only mode. If it reports issues, run the auto-fix commands above first, then re-run prek.

### Common failures and fixes

| Failure       | Fix                                                                  |
| ------------- | -------------------------------------------------------------------- |
| Format errors | `bun run format` (auto-fixes)                                        |
| Lint errors   | `bun run lint:fix` for auto-fixable issues; fix the rest manually    |
| Type errors   | Fix the TypeScript issue, then re-run `bunx tsc --noEmit`            |
| i18n errors   | Check for missing keys; run `bun run i18n:types` to regenerate types |
| Test failures | Fix the failing test or implementation; re-run `bunx vitest run`     |

## Development and Release Workflow

Use targeted tests while diagnosing a change, and run the complete `just push` gate only after the fixes are ready. Do not use the full gate as a failure-discovery loop. For CatfishCore, collect independent failures once with `just diagnose`, then use `just test-affected -p <crate>` while fixing them.

Run long tests, builds, and release monitors as background tasks and act on their completion notifications; do not hold a foreground shell open with `sleep` or repeated process polling. Avoid running CPU-heavy local tests and packaging at the same time, since resource contention makes both slower and can create misleading failures.

Check the release environment before packaging, then monitor or verify the exact source commit and workflow run:

```bash
bun run release:preflight -- --require-dependencies --network
bun run release:watch -- --repo salmoshu/Catfish --profile catfish --run-id 123456789 --sha <full-40-character-commit> --tag v0.5.0
bun run release:verify -- --repo salmoshu/Catfish --profile catfish --run-id 123456789 --sha <full-40-character-commit> --tag v0.5.0
```

For a manual stable release from `main`, a new tag is created only after every candidate build and package succeeds. Existing tags are immutable repair targets: their object IDs are checked again before publishing and are never moved. For infrastructure failures, explicitly rerun only failed jobs after inspecting the failure; do not launch another full build blindly.

## Enforcement

When these rules are not followed, maintainers may:

1. **Close and request resubmission** (preferred) — you retain full credit upon proper resubmission.
2. **Cherry-pick valuable portions** — your authorship is preserved in git history, but the original PR shows as "Closed" rather than "Merged".

Code style, dependency choices, and documentation polish are handled by maintainers post-merge. Focus your PR on the functional change.
