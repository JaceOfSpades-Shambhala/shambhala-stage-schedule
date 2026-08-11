# specs/

This directory is the handoff surface between Claude and Codex. The canonical
operating procedure is [docs/AGENT-LOOP-SETUP.md](../docs/AGENT-LOOP-SETUP.md),
and the executable architect instructions are in
[.claude/agents/architect.md](../.claude/agents/architect.md).

## Current loop

1. Start in one clean linked task worktree and record its branch and commit.
2. Claude writes one spec from `TEMPLATE.md`.
3. Codex reviews read-only; Claude may revise once.
4. The user approves the reviewed spec and its SHA-256 hash.
5. Codex implements as the sole writer in one foreground call.
6. Claude reviews the exact diff and reruns tests. The user selects any fixes;
   at most two correction rounds are allowed.
7. Claude commits locally and stops. Push, PR, merge, deploy, and worktree
   removal require explicit approval.

## Records

| File | Purpose |
|---|---|
| `TEMPLATE.md` | Required structure for a new spec |
| `NNN-slug.md` | Final plan and approved scope |
| `NNN-slug.review.md` | One concise Codex review result tied to the spec hash |
| `NNN-slug.result.md` | Final implementation summary and test result |
| `NNN-slug-fixN.md` | A user-selected correction, at most two rounds |

The final spec and hash, Git diff, and test output are the sources of truth.
Raw `*.dispatch.log` files are ignored and must not be committed. Legacy
`*.log.md` records remain for history but are not a template for new work.

Spec 004's plugin-dispatch proposal is retired and must not be implemented. It
was replaced by one foreground `codex exec` call with a hard timeout, closed
stdin, direct exit status, and one final response file.

## Deployment boundary

Pull requests validate without deploying. Merging to `main` runs validation,
tests, Cloudflare Worker deployment, GitHub Pages deployment, and exact live
revision checks. Neither agent pushes, opens or merges a PR, or deploys without
the user's explicit approval.
