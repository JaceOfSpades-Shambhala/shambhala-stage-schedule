You are auditing a repository and the agent framework built on top of it. Be
adversarial. Do not defer to the architect's stated reasoning, and do not soften
findings to be agreeable. Assume the framework's author has made repeated errors
and that your job is to find the ones still present.

# Why this audit exists

A human user has lost confidence in this framework. Their two stated concerns,
which you should treat as hypotheses to test rather than conclusions to confirm:

1. A roughly 40-line documentation change (spec 003) consumed a full three-round
   negotiation budget, a user-authorised fourth round, and a fix round. If the
   loop costs that much for 40 lines of prose, it may not survive a repository of
   tens of thousands of lines.
2. The architect made at least four self-admitted verification-authoring errors
   in a single session. Repeated errors of the same class suggest a systemic
   defect, not bad luck.

Test both. If you find the concerns overstated, say so and show why. If you find
them understated, say that.

# Scope — what to audit

**A. The specs and their logs**

- `specs/001-readme-module-systems.md` and `.log.md`
- `specs/002-vm-smoke-tests.md` and `.log.md`
- `specs/003-phase4-review-gate.md`, `.log.md`, and
  `specs/003-phase4-review-gate-fix1.md`
- `specs/004-codex-plugin-dispatch.md` and `.log.md`

For 001, 002 and 003: verify the implementation actually matches what the spec
prescribed, by reading the current files rather than trusting the logs. Report
any place where a spec claims something shipped that did not, or shipped
differently.

For 004: it has never been implemented. Review it as a plan. It has been through
three review rounds already; its log records the concerns and resolutions. Find
what those rounds missed.

**B. The framework itself**

- `AGENTS.md` — instructions given to you on every call
- `specs/TEMPLATE.md` — the structure every spec follows
- `specs/README.md` — the loop as documented for the user
- `.claude/agents/architect.md` — the architect's operating instructions
- `.claude/settings.json` — tracked permission rules
- `.claude/settings.local.json` — machine-local permission rules (gitignored)

Audit these as a system. Look for: internal contradictions, instructions that
cannot be satisfied simultaneously, rules that are unenforceable or unverifiable,
guidance that produces the error classes listed below, missing guidance where an
agent must otherwise guess, and anything that will break down as repository size
grows.

**C. Changes since release v78**

Commit range `ea2d918..HEAD` — 20 commits, 57 files, ~4300 insertions. Includes
application code, Worker code, tests, CI workflow, licence, and the framework
scaffolding itself.

Review for real defects: bugs, regressions, release-integrity violations,
security or privacy problems, broken invariants, CI or deployment hazards, and
anything that contradicts the rules in `AGENTS.md` — particularly the two module
systems, the release-version invariant, and the scope-of-writes restrictions.

# Scope — what NOT to audit

- **Do not review the installed Codex plugin.** Anything under
  `~/.claude/plugins/`, including `codex-companion.mjs`, its `lib/` modules, its
  skills, commands, agents, or hooks, is third-party and out of scope. You may
  read it *only* to check whether spec 004's factual claims about its behaviour
  are correct. Do not report defects in the plugin itself.
- Do not review the binary blobs under `shared/**/*.enc`. They are encrypted and
  not meaningfully reviewable. You may comment on whether committing multi-megabyte
  binaries is appropriate, but do not attempt to analyse their contents.
- Do not review `node_modules` or any vendored dependency.

# Error classes already known

The architect has admitted these. Report any **remaining** instances, and any
class of error not on this list.

1. A spec required a file to contain a literal string while its own verification
   asserted that string's count was zero. Both could not pass.
2. A spec prescribed verbatim prose in which a phrase wrapped across two lines,
   while requiring a line-based `grep` to match that phrase unwrapped.
3. A verification used `git diff` against `HEAD` to test what a single round
   changed, which conflates "changed by this round" with "changed since the last
   commit".
4. A shell check reported success when the underlying command had failed,
   because the error went to stderr and the check only tested for empty stdout.

Specifically: audit **every** verification command in **every** spec for whether
it actually tests what it claims, whether it can pass at all, and whether it
would fail loudly or silently on a wrong implementation.

# Also assess

- Does the three-round negotiation cap, the three-fix-round cap, and the
  one-spec-one-change rule work at scale, or do they produce the thrashing seen
  in spec 003? Recommend concrete changes if not.
- Is the architect/executor division of labour coherent? The architect is
  forbidden from writing application code. Identify where that rule creates
  overhead disproportionate to its benefit, and where it is genuinely load
  bearing.
- Is the audit trail in the `.log.md` files trustworthy? Cross-check at least
  several claims against the actual repository state. Report any claim that is
  wrong, overstated, or unverifiable.
- Are the permission rules in `.claude/settings.json` and
  `.claude/settings.local.json` coherent and safe? Note anything overly broad,
  redundant, or dangerous, especially entries permitting destructive commands.

# Required output

Do not implement anything. Do not edit any file. This is read-only.

Produce a single structured report with these sections, in this order:

1. **Verdict** — Is this framework sound, salvageable,
   or should it be rebuilt? Answer the user's two concerns directly.
2. **Critical** — defects that will cause incorrect behaviour, data loss, a bad
   deployment, or a security or privacy problem. Each with `file:line` evidence.
3. **Major** — real bugs, broken invariants, unsatisfiable or misleading
   verifications, and framework defects that will keep producing errors.
4. **Minor** — correctness and clarity issues worth fixing.
5. **Framework assessment** — scalability, the caps, the division of labour, and
   the trustworthiness of the audit trail. Be concrete.
6. **Changes to implement** — a numbered, prioritised, actionable list. Each item
   names the file, states what is wrong, and states what correct looks like.
   Order by value, not by section above.

Rules for the report:

- Every finding must cite `file:line` or a specific commit. No unsupported
  assertions.
- Separate what you verified by reading from what you infer. Label inferences.
- If you could not check something, say so explicitly rather than omitting it.
- Do not pad. A short accurate report is better than a long hedged one.
- If the framework is fundamentally sound and the user's concerns are
  overstated, say that plainly. Do not manufacture findings to appear thorough.
