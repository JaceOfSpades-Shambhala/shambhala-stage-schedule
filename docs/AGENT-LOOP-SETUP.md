# Agent loop — setup and operation

Claude (Opus) plans and reviews. Codex implements. This document covers the
install and the daily loop.

---

# Install

Everything lives on `main`, so every session inherits it regardless of which
branch that session's worktree is on. This is the fix for the most common failure
mode: a session that can't see `AGENTS.md` because it was committed elsewhere.

## Prerequisites

Already done if you followed the earlier setup:

- Git for Windows, with `user.name` and `user.email` configured
- Node.js 22+
- Codex CLI (`npm install -g @openai/codex`), authenticated via `codex login`
- PowerShell execution policy set to `RemoteSigned` (or use `codex.cmd`)

Verify:

```powershell
git --version; node --version; codex --version
git config user.email
```

## The install sequence

**Quit Claude Desktop first** so it isn't holding any worktrees open.

```powershell
cd C:\Users\Jace\dev\shambhala-stage-schedule

# 1. Return to a clean main
git restore .
git switch main

# 2. Remove any leftover session worktrees and branches (ignore errors if absent)
git worktree prune
git branch -D agent-loop 2>$null
git branch --list "claude/*" | ForEach-Object { git branch -D $_.Trim() }

# 3. Confirm you are at the live release
git log -1 --oneline    # expect: bc8f716 Fit shared documents to mobile screens
git status              # expect: working tree clean
git branch              # expect: only main

# 4. Put the scaffolding in place
New-Item -ItemType Directory -Force -Path .claude\agents, specs, docs
move agent-setup\AGENTS.md                            AGENTS.md
move agent-setup\architect.md                         .claude\agents\architect.md
move agent-setup\settings.json                        .claude\settings.json
move agent-setup\specs-TEMPLATE.md                    specs\TEMPLATE.md
move agent-setup\specs-README.md                      specs\README.md
move agent-setup\docs-AGENT-LOOP-SETUP.md             docs\AGENT-LOOP-SETUP.md
move agent-setup\docs-festival-platform-extraction.md docs\festival-platform-extraction.md
move agent-setup\docs-opus-plans-codex-codes-setup.md docs\opus-plans-codex-codes-setup.md
Remove-Item agent-setup -Recurse -Force

# 5. Ignore machine-local Claude files
Add-Content .gitignore "`n.claude/worktrees/`n.claude/settings.local.json"

# 6. One commit
git add AGENTS.md .claude specs docs .gitignore
git commit -m "Add architect/executor agent loop scaffolding"
git log -1 --stat
```

Expect 9 files changed, all markdown and JSON. **Do not push.** Your local `main`
is now one commit ahead of GitHub, and pushing `main` triggers a production
deploy.

## Verify

Restart Claude Desktop, then **Code** tab → **+ New session**, Environment
**Local**, project folder `C:\Users\Jace\dev\shambhala-stage-schedule`.

Ask:

> Run your Phase 0 preflight and report the result.

**Pass** — it reports the branch, confirms `AGENTS.md` and `specs/TEMPLATE.md`
exist, and prints a Codex version.

**Fail** — it says the scaffolding is missing. That means the commit didn't land
on `main`; re-check step 6.

Then confirm the model settings:

- `Ctrl+Shift+I` → **Opus**
- `Ctrl+Shift+E` → **max** (set it manually; `max` does not persist between
  sessions)

## First real test

Use something trivial, where a wrong answer is obvious:

> Add a short "Module systems" section to README.md explaining that browser
> scripts use window globals and Node/Worker code uses ESM, matching what
> AGENTS.md says. Documentation only — no code changes.

Watch for all six phases:

| Phase | What you should see |
|---|---|
| 0 Preflight | Branch, files, codex version confirmed |
| 1 Plan | `specs/001-*.md` appears; Claude **pauses** for your review |
| 2 Negotiate | `codex exec --sandbox read-only`; APPROVED or CONCERNS |
| 3 Implement | `codex exec --sandbox workspace-write` |
| 4 Review | Claude runs `git diff` and `npm test` **itself** |
| 5 Commit | Commits and stops, naming the branch and worktree path |
| 6 Push | Nothing until you say so — then a permission prompt |

Phases 1 and 4 are where the loop most often gets sloppy. If Claude charges past
the spec review, or accepts Codex's summary without running the tests, say so and
tighten `architect.md`.

---

# Operation

## Where your work lives

Each session gets its own git worktree on its own `claude/*` branch, under
`.claude/worktrees/`. Consequences:

- Claude's commits land on that branch, **not** on `main`
- The changed files are **not** in your main project folder until merged
- Opening `C:\Users\Jace\dev\shambhala-stage-schedule` in an editor during Phase 5
  will not show the changes

This is deliberate isolation. A bad run cannot touch `main`.

## Getting work onto main

After you've approved and Claude has pushed the session branch:

```powershell
cd C:\Users\Jace\dev\shambhala-stage-schedule
git switch main
git merge claude/<session-branch>
git push origin main     # ← this deploys
```

**That last line is the production deployment.** It runs Worker validation,
tests, the Cloudflare Worker deploy, the Pages deploy, and a live health check.

## Approval gates

`git push` is deliberately **not** in the permission allow list. When Claude tries
to push, Claude Code stops and asks you to approve that exact command. That prompt
is your sign-off — there's nothing else to configure.

`wrangler` and `gh release` are denied outright. Deployment happens only through
CI, only from `main`.

The force-push and hard-reset denies are seatbelts, not a sandbox. Claude has
Bash. The restrictions keep an honest agent honest; your Phase 5 review is what
actually protects the codebase.

## Two rules in AGENTS.md worth knowing about

**"Never edit tests to make them pass."** `test/release-integrity.test.mjs`
asserts on exact code shapes — regexes against `planner.js`, `styles.css`,
`app.js`. Any refactor breaks them, and the tempting fix is editing the assertion.
That would silently delete a regression guard.

**The version-bump rule.** Release `v78` is hardcoded across ~10 files
*including the test that guards it*. A bump must change all of them together or
`npm test` fails. Codex has no way to know this without being told.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "AGENTS.md does not exist" | Session worktree branched from a branch without the scaffolding | Confirm the commit is on `main`; start a new session |
| Claude prompts on every codex call | Allow rule not matching | Check `.claude/settings.json` for typos |
| `codex.ps1 cannot be loaded` | PowerShell execution policy | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, or use `codex.cmd` |
| Effort shows `high` not `max` | `max` is session-only and not settable via frontmatter | Set manually with `Ctrl+Shift+E`, or set `CLAUDE_CODE_EFFORT_LEVEL=max` (applies to all sessions) |
| "local changes would be overwritten" on branch switch | Uncommitted edits | `git restore .` then retry |
| Line-ending warnings on commit | CRLF/LF conversion | Harmless. Informational only. |
