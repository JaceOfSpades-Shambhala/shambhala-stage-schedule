# NNN — <title>

## Goal

<One sentence. What is true after this change that was not true before.>

## Context

<Why this change. Anything the executor needs that is not in AGENTS.md. Keep it
short — background, not narrative.>

## Files to change

<Exhaustive. Anything not listed here must not be touched.>

- `path/to/file.js` — <what changes>
- `path/to/other.js` — <what changes>

## Changes

<Precise enough that two competent developers would produce near-identical code.
Name functions, signatures, and behaviour. Include exact strings where they
matter. Reference existing patterns in the codebase by file and line where
possible.>

## Out of scope

<Explicitly name adjacent things NOT to touch. This section prevents more damage
than any other. Examples: "Do not bump the release version." "Do not modify
test/release-integrity.test.mjs." "Do not refactor the surrounding function.">

## Verification

<Exact commands and what passing looks like. At minimum `npm test`. Add a
behavioural check where one is possible — something that would fail if the change
were implemented wrongly but plausibly.>

```
npm test
```

Expected: all tests pass.

## Open questions

<Leave empty when writing. Codex fills this during plan review; the architect
resolves each one by revising the spec above, then clears this section.>
