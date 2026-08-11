# 005 — Constrain Pages staging to `dist`

Status: implemented locally on 2026-08-11; pending review and commit.

## Outcome

The Pages builder can recursively replace only this repository's `dist`
directory. Other arguments fail before any filesystem mutation.

## Files changed

- `scripts/build-pages.mjs`
- `test/build-pages-guard.test.mjs`

## Implementation

`resolveOutputDir()` accepts the default, `dist`, or the absolute path resolving
to the same directory. It rejects empty, root, parent, outside, source-directory,
root-file, and alternate-output arguments. Windows comparison is
case-insensitive.

The CLI body runs only when the module is invoked directly, so importing the
pure resolver in a test cannot execute `rm`, `mkdir`, or copying. Existing
allowlist checks and artifact copying remain unchanged.

## Verification

- `npm.cmd test`: 149 passed, 0 failed, schedule validation passed.
- `node --check scripts/build-pages.mjs`: passed.
- No dangerous CLI argument was executed against a real path.
