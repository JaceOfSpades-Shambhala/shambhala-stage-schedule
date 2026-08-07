# specs/

Plans handed from the architect (Claude) to the executor (Codex).

## The loop

```
0. PREFLIGHT   Claude checks AGENTS.md, specs/, and codex exist
1. PLAN        Claude writes specs/NNN-slug.md          → shows you the spec
2. NEGOTIATE   Codex reviews it read-only               → APPROVED or CONCERNS
               Claude revises, re-submits (max 3 rounds)
3. IMPLEMENT   Codex writes the code, runs npm test
4. REVIEW      Claude reads the diff, runs the tests    → fix specs if needed
               (max 3 fix rounds)
5. COMMIT      Claude commits to the session branch     → you review
6. PUSH        Only on your explicit approval
```

Codex never pushes or deploys. Claude never writes application code.

## Files

| File | Purpose |
|---|---|
| `TEMPLATE.md` | Structure every spec follows |
| `NNN-slug.md` | The plan. Revised in place during negotiation. |
| `NNN-slug.log.md` | Append-only audit trail: review rounds, resolutions, implementation reports, review findings |
| `NNN-slug-fixN.md` | Correction spec when implementation deviates |

## Where the work happens

Each Code tab session runs in **its own git worktree** on its own `claude/*`
branch, under `.claude/worktrees/`. Claude's commits land there, not on `main`,
and the changed files are not in your main project folder until you merge.

This is deliberate isolation — a bad run cannot touch `main`.

## Why the caps

Three negotiation rounds and three fix rounds. Past that, the problem is usually
that the task is too large or the goal is unclear — more rounds spend tokens
without converging. Hitting a cap is a signal to split the spec or rethink it,
not to raise the cap.

## When Codex wedges

Codex occasionally hangs at startup — the process launches but never begins a
session. Claude dispatches every `codex exec` in the background with a 15-minute
timeout, then checks within 60 seconds that a session rollout file appeared under
`~/.codex/sessions`. A healthy run creates one within seconds; a wedged run never
creates one at all. Claude kills and retries once, then escalates to you rather
than implementing the spec itself.

See "Dispatching Codex" in `.claude/agents/architect.md`.

## What deployment means here

`.github/workflows/pages.yml` triggers on `push` to `main`, on `pull_request`
targeting `main`, and on manual `workflow_dispatch`:

- **A `claude/*` branch with no open PR** — **nothing runs.** Pushing a branch by
  itself triggers no workflow at all. Validation requires an open PR against
  `main`.
- **Pull request into `main`** — Worker validation and tests only. Every deploy
  job is skipped via `if: github.event_name != 'pull_request'`.
- **`main`** — validation, tests, Cloudflare Worker deploy, GitHub Pages deploy,
  then a live release-health check.

**Merging to `main` is a production deployment.** There is no separate deploy
step, and `wrangler deploy` should never be run locally.
