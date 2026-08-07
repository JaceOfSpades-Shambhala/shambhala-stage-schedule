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

## What deployment means here

`.github/workflows/pages.yml` runs on push:

- **Any branch / PR** — Worker validation and tests only. Nothing deploys.
- **`main`** — validation, tests, Cloudflare Worker deploy, GitHub Pages deploy,
  then a live release-health check.

**Merging to `main` is a production deployment.** There is no separate deploy
step, and `wrangler deploy` should never be run locally.
