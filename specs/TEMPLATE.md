# NNN — <title>

Status: draft

## Outcome

<One plain-language sentence describing what will be true after the change.>

## Starting evidence

- Worktree: `<absolute linked-worktree path>`
- Branch: `<task branch, never main>`
- Starting commit: `<full SHA>`
- Starting status: clean
- Baseline tests: `<command and exact pass/fail result>`

## Current problem

<Concrete code or observed behaviour that justifies the change. Keep this
evidence-focused and short.>

## Files allowed to change

<Exhaustive. Any path not listed is out of scope.>

- `path/to/file.js` — <required change>

## Required behaviour

<Precise behaviour, preserved behaviour, and any intentional compatibility
constraints. Prefer observable outcomes over prescribed internal structure.>

## Out of scope

<Name adjacent work that must not be included.>

## Verification

List fail-loud commands and the behaviour each proves. Do not mask an exit code
with a later command, run destructive guard checks against real user paths, or
use output counts that do not prove the requirement.

```
npm test
```

Expected: all tests pass, plus any task-specific assertion above.

## User decisions

<Record any material choice already made by the user.>

## Open questions

<Claude resolves repository-answerable questions before Codex review. Leave only
questions that require a material user choice; do not ask Codex to fill this.>
