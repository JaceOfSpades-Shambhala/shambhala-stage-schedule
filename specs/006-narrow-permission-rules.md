# 006 — Restore approvals and make dispatch fail closed

Status: implemented locally on 2026-08-11; pending review and commit.

## Outcome

High-impact Git, PR, process, and Pages-build commands require confirmation;
the final reviewed plan requires user approval; and a failed Codex call cannot
silently continue.

## Files changed

- `.claude/settings.json`
- `.claude/settings.local.json` (machine-local and ignored)
- `.claude/agents/architect.md`

## Implementation

- Replaced the broad `node scripts/*` allow with the exact schedule validator.
- Added tracked `ask` rules for push, checkout/switch, restore/reset/stash,
  merge, forced branch deletion, worktree removal/pruning, PR actions,
  `taskkill`, and Pages staging. Claude Code evaluates `ask` before `allow`, so
  these prompts also override conflicting local allows.
- Removed the existing machine-local allows for push, checkout, PR actions,
  hard-coded process kills, arbitrary inline/mutable scripts, Python stdin, and
  raw transcript append commands.
- Replaced background/piped dispatch, global rollout scans, and PID searches
  with one foreground call whose timeout, exit status, and final response belong
  to that exact process.
- Added a maximum of two plan reviews, mandatory final-spec SHA-256 approval,
  sole-writer implementation, and at most two user-selected correction rounds.
- Tests may be edited only when the approved spec names them and never merely to
  make a failure disappear.

## Verification

- Both settings files parse as JSON.
- Thirteen tracked `ask` rules are present.
- The broad script allow and identified risky local allows are absent.
- `npm.cmd test`: 149 passed, 0 failed, schedule validation passed.
