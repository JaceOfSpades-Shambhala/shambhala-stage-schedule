# Claude plans, Codex implements

This is the canonical operating guide for the repository's supervised agent
loop. Claude plans and reviews. Codex alone edits implementation files. The user
approves the final reviewed plan before implementation and separately approves
any push, pull request, merge, deployment, or destructive cleanup.

The loop is useful for meaningful, reviewable changes. For a tiny edit, use
Codex directly; the planning handoff would cost more than it saves.

## Required layout

Keep the ordinary clone as a clean control checkout and create task worktrees as
siblings, not inside the repository:

```text
C:\Users\Jace\dev\
  shambhala-stage-schedule\              control checkout, clean main
  shambhala-stage-schedule-worktrees\
    <task-slug>\                          one temporary task worktree
```

Default to one active implementation worktree for this repository. Multiple
worktrees are appropriate only for deliberately concurrent tasks with different
branches and writers. They are not a task history; completed worktrees must be
removed.

## Prerequisites

- Git for Windows
- Node.js 22 or the version used by CI
- authenticated Codex CLI (`codex.cmd login` when PowerShell blocks `codex.ps1`)
- Claude Code/Desktop with the repository's `architect` agent

Check versions from PowerShell:

```powershell
git --version
node --version
codex.cmd --version
```

## Start a task

Run this from the control checkout. Replace `<slug>` with a short unique name.

```powershell
Set-Location C:\Users\Jace\dev\shambhala-stage-schedule
git fetch origin
git status --short
git worktree list
New-Item -ItemType Directory -Force ..\shambhala-stage-schedule-worktrees
git worktree add -b codex/<slug> ..\shambhala-stage-schedule-worktrees\<slug> origin/main
Set-Location ..\shambhala-stage-schedule-worktrees\<slug>
git status --short
npm.cmd test
```

Stop if either status command prints anything or the baseline tests fail. Do not
use `git restore`, stash, reset, clean, or force deletion to make the problem
disappear. Identify and preserve the existing work first.

Open Claude and Codex in the task worktree, never in the control checkout. The
architect preflight verifies that it is a linked worktree, records the starting
commit, and refuses to implement on `main` or from a dirty tree.

## The supervised loop

1. Claude inspects the code and writes one focused spec.
2. Codex reviews that spec read-only. Claude may revise it once; a second set of
   concerns goes back to the user instead of starting recursive review.
3. Claude shows the final spec, exhaustive file list, verification plan, and
   SHA-256 hash. The user explicitly approves that exact version.
4. Codex runs once in the foreground as the sole implementation writer. Its
   stdin is closed, the call has a hard timeout, and only its final response is
   kept. A timeout, non-zero exit, empty response, or agent error stops the loop.
5. Claude independently reads the exact Git diff and runs `npm test`. If there
   are real findings, the user selects corrections. There are at most two
   correction rounds.
6. Claude stages only named files, commits locally, reports the branch and
   worktree path, and stops. Push and PR actions need new user approval.

There is no background process monitor, plugin dispatch state machine, global
Codex-session scan, PID search, or raw transcript archive. The spec and hash,
the concise result, the Git diff, and test output are the evidence.

## Approval and writer boundaries

- Claude may write specs before implementation and create the reviewed commit
  afterward. It never edits source, tests, scripts, configuration, workflows, or
  project documentation.
- Codex may edit only files named by the approved spec. Tests may change only
  when the approved spec names them, and never merely to silence a failure.
- While Codex is running, Claude makes no repository writes. Foreground dispatch
  keeps the two agents from writing concurrently.
- Tracked Claude `ask` rules force confirmation for push, checkout/switch,
  restore/reset/stash/merge, forced branch deletion, worktree removal/pruning,
  PR actions, process termination, and Pages staging. Ask rules take precedence
  over machine-local allows.
- Local `wrangler deploy` remains denied. Merging to `main` lets CI test and
  deploy the current v79 release.

## Close a task

After the branch is merged, or after the user explicitly decides to abandon it,
return to the control checkout:

```powershell
Set-Location C:\Users\Jace\dev\shambhala-stage-schedule
git worktree list
git -C ..\shambhala-stage-schedule-worktrees\<slug> status --short
git worktree remove ..\shambhala-stage-schedule-worktrees\<slug>
git branch -d codex/<slug>
git worktree prune --dry-run
git worktree prune
git worktree list
```

The task status must be empty before removal. `git branch -d` is intentionally
non-forcing and should be used only after Git recognizes the branch as merged.
If either command refuses, stop and inspect; routine cleanup never uses
`--force` or `git branch -D`.

`git worktree prune` removes stale administrative records for directories that
were already deleted incorrectly. It is not a substitute for `git worktree
remove`; always preview it with `--dry-run`.

## Troubleshooting

| Symptom | Response |
|---|---|
| The worktree list keeps growing | Close completed tasks with `git worktree remove`; then preview and prune only stale records. |
| A worktree is dirty | Preserve and review the changes. Do not force-remove it. |
| The task branch is already checked out | Reuse its existing worktree or choose a new branch; do not pass `--force`. |
| Codex times out or returns no result | Stop and report the failed call. Do not search or kill unrelated Codex processes. |
| The final spec changed after approval | Recompute the hash and obtain approval again. |
| `npm.ps1` or `codex.ps1` is blocked | Use `npm.cmd` or `codex.cmd`. |

## Primary references

- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
