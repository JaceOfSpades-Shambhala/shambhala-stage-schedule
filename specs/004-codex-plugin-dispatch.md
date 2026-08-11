# 004 — Plugin-based Codex dispatch (retired)

Status: retired on 2026-08-11; never implemented.

The proposal would have routed Codex through a machine-local Claude plugin and
added background jobs, polling, parsing, fallback behaviour, and more permission
rules. Review found the runtime contract incomplete after repeated rounds, and
the extra state machine did not solve a current product requirement.

The replacement is documented in `.claude/agents/architect.md`: one foreground
`codex exec` process, closed stdin, a hard tool timeout, direct exit status, and
one final response file. A failed or incomplete call stops the loop instead of
falling through to another dispatch path.

The original proposal and review discussion remain available in Git history and
`specs/004-codex-plugin-dispatch.log.md`. Do not implement the plugin plan.
