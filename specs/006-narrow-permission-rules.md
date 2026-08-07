# 006 — Restore the human gates the permission rules currently bypass

## Goal

Pushing, opening or merging pull requests, discarding working-tree files, killing
processes, and running arbitrary code all require human approval again, and
`node scripts/...` no longer auto-approves every script in the directory.

## Context

Audit finding C2. The architect's instructions state that the push prompt is "the
deliberate final gate" (`.claude/agents/architect.md:256-262`). That is false in
practice: `.claude/settings.local.json` auto-allows `git push *` (line 13),
`git checkout *` (line 5), `gh pr *` (line 15), broad `node -e ' *` (line 18),
and a hard-coded `taskkill //PID 30880 //F` (line 21) whose PID can later belong
to an unrelated process.

`.claude/settings.json:19` auto-allows `Bash(node scripts/:*)`, which is what
made the destructive path in audit finding C1 reachable without a prompt.

Two facts govern the design:

- An allow rule that matches means the command runs with no approval.
- A deny rule takes precedence over an allow rule, including one in the local
  file. Deny is therefore the only way a tracked file can constrain a
  machine-local allow.

Deny is used sparingly here, and only for actions that should never happen
unattended. Actions that should happen *with* approval are handled by **removing**
the allow, which makes them prompt rather than making them impossible. Pushing is
deliberately left promptable, not denied, so Phase 6 still works.

## Files to change

- `.claude/settings.json` — narrow one allow entry, add four deny entries
- `.claude/settings.local.json` — remove seven allow entries

## Changes

### `.claude/settings.json`

In `permissions.allow`, replace this single entry:

```
"Bash(node scripts/:*)"
```

with exactly:

```
"Bash(node scripts/validate-schedule.mjs)"
```

Every other allow entry stays, in its existing order.

In `permissions.deny`, append these four entries after the existing ones,
preserving the existing entries and their order:

```
"Bash(gh pr merge:*)"
"Bash(gh pr close:*)"
"Bash(taskkill:*)"
"Bash(node scripts/build-pages.mjs:*)"
```

Rationale to preserve in the file only as JSON — do not add comments, since JSON
does not support them.

### `.claude/settings.local.json`

Remove exactly these seven entries from `permissions.allow`. Match them
literally; do not remove anything else, and do not reorder or reformat the
entries that remain:

```
"Bash(git checkout *)"
"Bash(git push *)"
"Bash(gh pr create --base main --head claude/loop-test --title 'Document the two module systems in README' --body ' *)"
"Bash(gh pr *)"
"Bash(node -e ' *)"
"Bash(taskkill //PID 30880 //F)"
"Bash(sed -i 's|const root = .*|const root = \"C:/Users/Jace/dev/shambhala-stage-schedule/\";|' probe.mjs)"
```

Leave the file's `permissions.allow` array otherwise intact, including
`Bash(codex exec *)`, the `git add`/`git commit` entries, the `gh run` and
`gh auth` entries, and the read-only inspection entries.

Do not add a `deny` block to this file. Denies belong in the tracked file where
they cannot be silently removed per-machine.

## Out of scope

- Do not deny `git push`. It must still be possible with explicit human
  approval, which is what Phase 6 depends on.
- Do not deny `git checkout`. Branch creation in Phase 5 needs it; removing the
  local wildcard is sufficient to make it prompt.
- Do not modify `.claude/agents/architect.md`. Correcting its false claim about
  the push gate is deferred to the framework work.
- Do not modify `scripts/build-pages.mjs`. Spec 005 covers it.
- Do not modify any application file, test, workflow, or `AGENTS.md`.
- Do not bump the release version.

## Verification

Both files must remain valid JSON, and the edits must be exactly as specified.

```
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('settings.json OK')"
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8')); console.log('settings.local.json OK')"
```

Expected: both print `OK`. A parse error exits non-zero and is a failure.

```
node -e "const s=JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); const a=s.permissions.allow, d=s.permissions.deny; console.log('broadScripts=', a.filter(x=>x==='Bash(node scripts/:*)').length); console.log('narrowScript=', a.filter(x=>x==='Bash(node scripts/validate-schedule.mjs)').length); console.log('denyCount=', d.length);"
```

Expected: `broadScripts= 0`, `narrowScript= 1`, `denyCount= 12` (the eight
existing deny entries plus the four added).

```
node -e "const s=JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8')); const a=s.permissions.allow; const banned=['Bash(git checkout *)','Bash(git push *)','Bash(gh pr *)','Bash(node -e \' *)','Bash(taskkill //PID 30880 //F)']; console.log('remainingBanned=', a.filter(x=>banned.includes(x))); console.log('hasDeny=', Object.prototype.hasOwnProperty.call(s.permissions,'deny')); console.log('allowCount=', a.length);"
```

Expected: `remainingBanned= []`, `hasDeny= false`, and `allowCount= 34` — the
original 41 entries minus the 7 removed.

```
npm test
```

Expected: unchanged, `fail 0`. No application code is touched, so this only
proves nothing broke collaterally.

```
git status --porcelain
```

Expected: `.claude/settings.json` modified. `.claude/settings.local.json` must
**not** appear, because it is gitignored — if it does appear, the wrong file was
edited or `.gitignore` changed.

## Open questions
