## 1. Verdict

**Salvageable, but not sound.** The application architecture does not need rebuilding; the review/verification control plane does.

Both user concerns are confirmed:

- **Concern 1 is substantially correct.** Spec 003 needed three planned review rounds, a user-authorized fourth, and a correction round for a small documentation change ([003 log:28-249](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:28), [003 log:253-363](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:253)). This does not prove cost grows linearly with repository size, but it proves the current loop has excessive fixed overhead and poor convergence even on prose.
- **Concern 2 is understated.** The four admitted errors were not isolated: broken verification remains committed in the specs, current dispatch logic can mask failures and kill unrelated processes, and spec 004 repeats the same under-specified-verification pattern.
- Specs 001, 002, and 003 do individually match their current implementations. I found no claim that one of those changes was wholly unimplemented.
- The `ea2d918..HEAD` application code passed all **148 tests** plus schedule validation. I found no newly introduced browser/ESM module-system violation and no behavioral Worker change—the Worker diff is copyright headers only.
- Passing tests do not cover the critical filesystem, permission, release-cache, and framework defects below.

## 2. Critical

### C1. The Pages build script can recursively delete the repository or its parent

**Verified.** The output directory is formed directly from an unrestricted command-line argument, then recursively removed ([scripts/build-pages.mjs:24-25,59](/C:/Users/Jace/dev/shambhala-stage-schedule/scripts/build-pages.mjs:24)). I verified without executing the deletion that:

- `.` resolves to the repository root.
- `..` resolves to `C:\Users\Jace\dev`.
- `../outside` resolves outside the repository.

Therefore `node scripts/build-pages.mjs .` deletes the repository after its initial checks. The tracked permissions automatically allow commands matching `node scripts/...` ([.claude/settings.json:19](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.json:19)), making this reachable without a permission prompt.

### C2. Machine-local permissions defeat the framework’s human gates

**Verified.** The local rules auto-allow:

- `git checkout *`, which includes discarding working-tree files ([settings.local.json:5](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.local.json:5)).
- `git push *`, including ordinary pushes and remote branch deletion ([settings.local.json:13](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.local.json:13)).
- `gh pr *`, including merging or closing PRs ([settings.local.json:15](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.local.json:15)).
- Broad `node -e` execution ([settings.local.json:18](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.local.json:18)).
- Hard-coded forced process termination commands, whose PIDs can later be reused by unrelated processes ([settings.local.json:21,44](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.local.json:21)).

Claude’s documented permission model says matching allow rules execute without approval; deny rules take precedence only when they actually match ([Claude Code permissions](https://code.claude.com/docs/en/permissions)). The tracked deny list blocks only some force-push spellings, hard reset, clean, rebase, and deploy commands ([settings.json:22-29](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/settings.json:22)). It does not neutralize normal push, PR merge, checkout-based data loss, or arbitrary code execution.

This directly contradicts the claimed deliberate push prompt ([architect.md:256-262](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:256)).

### C3. Release v78 was functionally changed without a cache/version bump

**Verified.** Commit `34bb2d4` removed `hex-owl-playground.html` from the published site and service-worker asset list, but the cache remains `stage-schedule-v78` ([sw.js:6](/C:/Users/Jace/dev/shambhala-stage-schedule/sw.js:6)). Installation reopens the same cache and adds current entries, while activation deletes only caches with different names ([sw.js:59-76](/C:/Users/Jace/dev/shambhala-stage-schedule/sw.js:59)). It never removes entries deleted from the v78 list.

Consequently, existing v78 installations can retain and serve the supposedly removed playground: failed network responses fall back to any matching cached response ([sw.js:152-176](/C:/Users/Jace/dev/shambhala-stage-schedule/sw.js:152)).

The deployment health check is also unable to distinguish the baseline v78 page from later v78 code because it checks only the unchanged HTML marker ([pages.yml:103-107](/C:/Users/Jace/dev/shambhala-stage-schedule/.github/workflows/pages.yml:103), [index.html:30](/C:/Users/Jace/dev/shambhala-stage-schedule/index.html:30)). The Worker’s exact-SHA health check is materially stronger ([pages.yml:108-121](/C:/Users/Jace/dev/shambhala-stage-schedule/.github/workflows/pages.yml:108)).

## 3. Major

### M1. The verification system still contains impossible and non-probative checks

**Verified.** Every spec’s verification section was audited:

| Spec | Result |
|---|---|
| 001 | `npm test` is valid. `git diff` is relative to `HEAD`, not the round’s starting state. The heading grep does not verify the required body, and the phrase count does not establish byte-exact prose ([001:109-140](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/001-readme-module-systems.md:109)). |
| 002 | The tests are valid. The export snippet checks named exports, but its version check proves only “nonempty,” not the complete shared-context contract. Its status/diff checks are `HEAD`-relative and omit untracked content ([002:220-263](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/002-vm-smoke-tests.md:220)). |
| 003 | `npm test` does not test the prose/control-flow contract. String counts can pass with phrases in comments or the wrong section. Status remains `HEAD`-relative ([003:140-180](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.md:140)). |
| 003 fix1 | One required phrase exists once in prescribed prose and once in the verification itself, so the asserted count of one is impossible. Its whitespace diff compares all uncommitted work to `HEAD`, not pre-fix content. It also says there are ten required-one checks when the referenced spec contains twelve ([fix1:79-114](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate-fix1.md:79)). |
| 004 | `npm test`, broad status checks, one permission substring, taskkill occurrence, and one Phase 4 phrase can all pass while the dispatch state machine, parsing, retries, fallbacks, and prompts are wrong or absent ([004:181-221](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:181)). |

The template does not require a fail-loud executable verifier, exit-code capture, `pipefail`, or a pre-change snapshot ([TEMPLATE.md:32-42](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/TEMPLATE.md:32)). The same error class is therefore still being generated by design.

### M2. Current dispatch supervision can report success after failure and kill unrelated Codex processes

**Verified.** The architect pipes `timeout ... codex exec` into `tee` without `pipefail` or explicit pipeline-status capture ([architect.md:55-69](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:55)). The pipeline can therefore inherit `tee`’s success after Codex fails or times out.

Its liveness check searches every recent file under the global Codex session directory, not the dispatched job ([architect.md:71-86](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:71)). Its recovery path searches all Windows Codex processes and force-kills a PID selected from process-table output, again without correlation to the dispatched job ([architect.md:88-118](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:88)).

This is the same stderr/exit-status failure class the architect already admitted, not a resolved historical issue.

### M3. Spec 004 remains under-specified after its reviews

**Verified plan defect.**

- It alternates between “expand `<COMPANION>`” and literal commands containing `"<COMPANION>"` ([004:18-22,124-143](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:18)).
- Initial task dispatch does not request JSON and does not define how the job ID is parsed ([004:93-103](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:93)).
- “Run a background polling loop” supplies no exact invocation, parser dependency, output-capture mechanism, malformed-response behavior, or job cleanup ([004:101-123](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:101)).
- Preflight checks only whether the plugin file exists, not its version or API behavior ([004:86-91](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:86)).
- Fallback is retained only for absence, not incompatibility or repeated command failure ([004:145-156](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:145)).
- The proposed permission wildcard authorizes every companion subcommand while requiring all existing dangerous entries to remain ([004:75-82](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.md:75)).

I read the installed plugin only to validate 004’s factual claims, as permitted. Its v1.0.6 job/status/result behavior broadly matches the context section; the defect is that the plan never translates those facts into an exact, verifiable protocol.

The three rounds reviewed a combined precursor. The current split-out spec incorporates later edits, is untracked at audited HEAD `a01ed41`, and its log says the final version had not been dispatched for a new review ([004 log:350-360](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.log.md:350)).

### M4. The loop has no trustworthy starting-state boundary

**Verified.** Phase 0 prints the branch and checks tools, but does not require:

- A non-main feature branch.
- A clean working tree.
- A recorded starting SHA.
- A green baseline test run.

See [architect.md:15-31](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:15) and [architect.md:140-153](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:140). Phase 4 makes red tests block Phase 5 without distinguishing pre-existing failure from executor regression ([architect.md:199-205](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:199)).

The documentation claims each Code-tab session has its own worktree ([specs/README.md:32-36](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/README.md:32)), but spec 001’s log explicitly records execution in the main checkout ([001 log:5-7](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/001-readme-module-systems.log.md:5)). The claimed isolation is convention, not enforcement.

### M5. Framework instructions contradict one another

**Verified.**

- The spec template says Codex fills the Open Questions section during plan review ([TEMPLATE.md:44-47](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/TEMPLATE.md:44)), while Phase 2 requires review to be read-only ([architect.md:155-162](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:155)).
- Phase 3 unconditionally tells Codex not to edit test files ([architect.md:176-185](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:176)), even when an approved spec legitimately requires new tests. The spec 002 log records manually narrowing that prompt to escape the contradiction ([002 log:232-238](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/002-vm-smoke-tests.log.md:232)).
- The framework says specs above roughly 150 lines must be split ([architect.md:279-285](/C:/Users/Jace/dev/shambhala-stage-schedule/.claude/agents/architect.md:279)); specs 002, 003, and 004 are approximately 268, 185, and 223 lines respectively.

### M6. CI can attempt production deployment from a manually selected non-main ref

**Verified YAML; conditional external impact.** `workflow_dispatch` is enabled, and both production deployment jobs run for every event that is not a pull request ([pages.yml:3-11,53-93](/C:/Users/Jace/dev/shambhala-stage-schedule/.github/workflows/pages.yml:3)). GitHub explicitly supports manually dispatching a workflow against a selected `--ref` ([GitHub workflow dispatch documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)).

Therefore a manual feature-branch run attempts Worker and Pages production deployment. GitHub environment branch restrictions or approvals could stop it, but I could not inspect those external settings.

The workflow also grants `pages: write` and `id-token: write` globally to validation and test jobs ([pages.yml:13-17](/C:/Users/Jace/dev/shambhala-stage-schedule/.github/workflows/pages.yml:13)), rather than only deployment jobs, and validation executes mutable `npx --yes wrangler@4` code ([pages.yml:25-38](/C:/Users/Jace/dev/shambhala-stage-schedule/.github/workflows/pages.yml:25)). GitHub supports job-scoped permissions and OIDC permissions ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)).

### M7. The audit trail contains correct facts, but is not trustworthy as evidence

**Verified.**

- Logs for 001 and 002 correctly describe the implementations now present ([001 log:117-157](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/001-readme-module-systems.log.md:117), [002 log:268-321](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/002-vm-smoke-tests.log.md:268)).
- The 003 log correctly records the wrapped-line failure and four verification-authoring errors ([003 log:253-363](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:253)).
- It incorrectly describes “all twelve checks” as eleven required-one plus two required-zero checks—thirteen checks—and the current spec actually has twelve required-one plus two required-zero checks ([003 log:324-326](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:324)).
- The 004 log says the Phase 4 gate drew zero concerns across all three rounds ([004 log:325-333](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/004-codex-plugin-dispatch.log.md:325)); the subsequent standalone 003 process recorded 4, 4, and 2 concerns, plus a fourth round and correction ([003 log:28-363](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:28)). At best the 004 statement became stale; as current audit history it is misleading.
- The claimed whitespace-only fix cannot be independently reconstructed because no pre-fix snapshot or commit was recorded ([003 log:301-323](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:301)).

Logs contain prose summaries rather than immutable revision IDs, commands, exit codes, and separate stdout/stderr. Current 004 artifacts are also untracked at HEAD `a01ed41`.

### M8. Documentation has split into contradictory operating procedures

**Verified.** The current README says CI deploys the Worker, then says the Worker is deployed separately with local Wrangler ([README.md:193-195](/C:/Users/Jace/dev/shambhala-stage-schedule/README.md:193)). HANDOFF instructs rerunning Wrangler ([HANDOFF.md:39](/C:/Users/Jace/dev/shambhala-stage-schedule/HANDOFF.md:39)), while AGENTS forbids local deployment and states CI handles deployment ([AGENTS.md:104-111](/C:/Users/Jace/dev/shambhala-stage-schedule/AGENTS.md:104)).

A separate setup document still describes the obsolete auto-fix loop and a permission model denying all pushes ([docs/opus-plans-codex-codes-setup.md:302-396](/C:/Users/Jace/dev/shambhala-stage-schedule/docs/opus-plans-codex-codes-setup.md:302)). That conflicts with both the current architect and local permissions.

### M9. Spec 002’s “single reusable implementation” goal was not integrated into repository guidance

**Verified.** The helper exists and the validator imports it ([scripts/load-globals.mjs:1-33](/C:/Users/Jace/dev/shambhala-stage-schedule/scripts/load-globals.mjs:1), [validate-schedule.mjs:6-27](/C:/Users/Jace/dev/shambhala-stage-schedule/scripts/validate-schedule.mjs:6)). But README and AGENTS still instruct future contributors to reproduce the inline `vm.runInNewContext` implementation ([README.md:100-129](/C:/Users/Jace/dev/shambhala-stage-schedule/README.md:100), [AGENTS.md:46-55](/C:/Users/Jace/dev/shambhala-stage-schedule/AGENTS.md:46)).

This is a concrete one-spec-one-change failure: each spec passed locally, but the combined repository now teaches two conventions.

### M10. The Pages allowlist is not actually default-deny for directory contents

**Verified.** The manifest calls itself the single source of truth and says new files are private by default, but whole `fonts/`, `stage-names/`, and `shared/` directories are recursively copied ([pages-manifest.mjs:6-12,62-69](/C:/Users/Jace/dev/shambhala-stage-schedule/scripts/pages-manifest.mjs:6), [build-pages.mjs:62-67](/C:/Users/Jace/dev/shambhala-stage-schedule/scripts/build-pages.mjs:62)). The prohibited-pattern list is necessarily incomplete ([pages-manifest.mjs:87-98](/C:/Users/Jace/dev/shambhala-stage-schedule/scripts/pages-manifest.mjs:87)).

The tests validate allowed directory names, but except for the known shared viewer bundle do not require an exact per-file allowlist ([pages-artifact.test.mjs:56-117](/C:/Users/Jace/dev/shambhala-stage-schedule/test/pages-artifact.test.mjs:56)). A misplaced private file under `fonts` or `stage-names` would publish automatically.

## 4. Minor

### m1. Asset-discovery tests accept avoidable blind spots

**Verified.** Browser-script discovery is case-sensitive even though HTML tag and attribute names are case-insensitive ([browser-script-syntax.test.mjs:18-30](/C:/Users/Jace/dev/shambhala-stage-schedule/test/browser-script-syntax.test.mjs:18)). Pages HTML-reference scanning recognizes only double-quoted attributes ([pages-artifact.test.mjs:37](/C:/Users/Jace/dev/shambhala-stage-schedule/test/pages-artifact.test.mjs:37)). A future uppercase `<SCRIPT SRC>` or single-quoted reference can escape the intended checks.

### m2. The copyright-header rule is factually false

**Verified.** AGENTS says every source file carries a header ([AGENTS.md:115-116](/C:/Users/Jace/dev/shambhala-stage-schedule/AGENTS.md:115)), but new source-like files such as the shared viewer begin directly with markup and tests begin directly with imports ([shared viewer:1](/C:/Users/Jace/dev/shambhala-stage-schedule/shared/opus-plans-codex-codes/index.html:1), [pages-artifact.test.mjs:1](/C:/Users/Jace/dev/shambhala-stage-schedule/test/pages-artifact.test.mjs:1)). Either define “source file” precisely or enforce the claim.

### m3. Encrypted shared bundles provide confidentiality, not revocation

**Verified mechanism; inferred operational consequence.** The viewer reads the decryption key from the URL fragment and decrypts public AES-GCM ciphertext client-side ([shared viewer:207-252](/C:/Users/Jace/dev/shambhala-stage-schedule/shared/opus-plans-codex-codes/index.html:207)). This correctly keeps the key out of the server request.

**Inference:** once a recipient copies the ciphertext and fragment key, access cannot be revoked by removing the link. The committed ciphertext also adds roughly 8.5 MB to Git history. That may be acceptable, but it should be documented as link secrecy rather than revocable access control.

## 5. Framework assessment

### Scalability and caps

The three-round negotiation cap is useful only as a circuit breaker: it forced human intervention after round three. It did not produce convergence. Spec 003’s concerns progressed 4 → 4 → 2 before the extra round ([003 log:28-249](/C:/Users/Jace/dev/shambhala-stage-schedule/specs/003-phase4-review-gate.log.md:28)).

The fixed caps and one-spec-one-change rule are too mechanical:

- A trivial prose change pays the same six-phase setup cost as risky application work.
- Large specs violate the framework’s own 150-line split guidance.
- Independent specs create integration drift, as spec 002 demonstrated.
- A three-fix-round cap does not distinguish three unrelated corrections from repeated failure of the same error class.

Use risk and dependency boundaries instead of line counts. Add a fast path for documentation-only changes and terminate earlier when the same verification-authoring defect recurs.

### Architect/executor division

The split is load-bearing for application behavior, security/privacy changes, tests encoding invariants, CI, deployment, and release changes. Independent implementation and review are valuable there.

It is disproportionate for README wording, spec maintenance, log corrections, and `.claude` documentation. Forbidding the architect from correcting its own prose forces a second agent to reconstruct context, then creates another review and fix cycle. The architect should be allowed to implement documentation/framework-only changes, with Codex remaining the independent reviewer. Keep application source, test, workflow, and deployment changes executor-only.

### Audit-trail trust

The logs are useful narratives, not reliable evidence. Correct claims coexist with stale statements, arithmetic errors, unverifiable historical diffs, and untracked final artifacts. A trustworthy trail needs immutable spec revision identifiers, starting/ending Git SHA, clean-state status, exact commands, exit codes, separate stdout/stderr, and hashes of reviewed outputs.

### Scope and checks not completed

- I did not inspect encrypted blob contents, `node_modules`, or vendored dependencies.
- I inspected the installed plugin only enough to validate spec 004’s behavioral claims and did not audit it for defects.
- I could not inspect GitHub environment protection, branch restrictions, secrets, or the currently deployed live revision. The manual-ref deployment finding is therefore conditional on those external controls.
- Changes to `.github/workflows`, `LICENSE`, and copyright headers occurred in commits `599eae5` and `8845b58`, before AGENTS was introduced in `71f39c4`. I do not count those historical changes as violations of rules that did not yet exist.
- The worktree was already dirty with untracked spec/audit artifacts. I made no file changes.

## 6. Changes to implement

1. **`scripts/build-pages.mjs`** — Resolve and validate the destination before deletion. Reject the repository root, ancestors, paths outside the repository, empty arguments, and source directories. Permit only an explicit safe staging directory.

2. **`.claude/settings.json` and `.claude/settings.local.json`** — Remove broad `git push *`, `git checkout *`, `gh pr *`, generic code execution, hard-coded `taskkill`, and unrestricted script permissions. Allow exact read-only commands; require human approval for push, merge, checkout-based restoration, process termination, and arbitrary execution.

3. **`sw.js`, `index.html`, and all v78-coupled files** — Perform the complete release bump required by [AGENTS.md:70-85](/C:/Users/Jace/dev/shambhala-stage-schedule/AGENTS.md:70). The cache name must change so removed v78 assets are purged.

4. **`.github/workflows/pages.yml`** — Prove Pages deployment with a commit-derived revision marker, not the reusable release number. Restrict deploy jobs to `push` on `main` or explicitly validated refs; scope Pages/OIDC permissions to deployment jobs; pin Wrangler to an exact reviewed version.

5. **`.claude/agents/architect.md` and `specs/TEMPLATE.md`** — Add a mandatory clean-tree, branch, starting-SHA, and baseline-test snapshot. Give every round a recorded before/after boundary. Require fail-loud commands with explicit exit-status handling and separate stderr capture.

6. **`specs/003-phase4-review-gate-fix1.md`** — Correct or retire the impossible count, invalid `HEAD` comparison, and wrong suite totals. Do not leave known-broken verification as a reusable example.

7. **`specs/004-codex-plugin-dispatch.md`** — Specify exact JSON-producing commands, schema validation, job-ID extraction, polling implementation, timeout/cancellation behavior, output storage, retry rules, version/API preflight, and a complete exact fallback. Narrow permission rules to the required subcommands.

8. **`specs/README.md` and `architect.md`** — Replace fixed line/round heuristics with risk tiers: fast documentation path, standard code path, and high-risk deployment/security path. Stop and redesign after the same verification defect appears twice instead of consuming an arbitrary fix budget.

9. **`README.md`, `HANDOFF.md`, `docs/AGENT-LOOP-SETUP.md`, and `docs/opus-plans-codex-codes-setup.md`** — Establish one authoritative operating document. Remove or clearly archive obsolete push, deployment, auto-fix, and permission instructions.

10. **`scripts/pages-manifest.mjs` and `test/pages-artifact.test.mjs`** — Replace recursive directory allowance with an exact file manifest, validate every staged path, and make HTML-reference parsing cover valid quoting and casing.

11. **`README.md` and `AGENTS.md`** — Point contributors to `scripts/load-globals.mjs` as the sole house implementation instead of teaching duplicate inline VM code.

12. **All `.log.md` generation** — Record immutable spec hashes, starting/ending commit IDs, exact commands, exit codes, stdout/stderr artifacts, and final tracked state. Treat prose summaries as commentary, not verification evidence.


---

## Post-audit: specs 005-007 review, round 1 — CONCERNS (10)

Combined review of the three Critical-fix specs returned ten concerns. Architect
verified the factual claims rather than accepting them:

- `.claude/settings.local.json` has **63** allow entries, not the 41 the spec
  assumed. The file grew during the session as permission prompts appended to it,
  so any hardcoded count is stale by the time it is written.
- `git grep -c` counts matching **lines**, not occurrences. Spec 007 reported line
  counts as occurrence counts across all fourteen files. Actual: `sw.js` 38 not
  37, `test/service-worker.test.mjs` 14 not 13, `AGENTS.md` 6 not 5.
- `HANDOFF.md:134` is a historical release note describing what v78 contained.
  Spec 007 would have rewritten it to v79, falsifying version history.

**Most serious.** Spec 005's verification instructed running
`node scripts/build-pages.mjs ..` directly. Against a wrong or absent guard that
deletes `C:\Users\Jace\dev`. The trailing `; echo "exit=$?"` also makes the
compound command exit 0 regardless of Node's status, so the failure would not
even have been reported.

That is audit error class 4 reproduced inside the fix for error class 1, with a
destructive failure mode. Related: importing `resolveOutputDir` from
`build-pages.mjs` executes the module's top-level `rm`/`mkdir`/copy body, so the
test that promised never to call `rm` would have called it on import.

Also raised and accepted: Claude Code supports tracked `ask` rules, evaluated
before allows, which force approval without making a command impossible. Spec 006
used `deny`, which blocks outright and would have made `build-pages.mjs`
unapprovable — contradicting spec 005's own verification. Spec 006's stated
Phase 5 rationale was also factually wrong: Phase 5 contains no branch-creation
command.

No spec revised yet. Escalated to the user before further iteration.
