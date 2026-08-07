# Opus Plans, Codex Codes — Windows Setup Guide

A step-by-step guide to wiring Claude Opus 5 (at max effort) as a planning
orchestrator that drives OpenAI Codex as the executor.

---

## What you're building

```
   You
    │
    ▼
┌─────────────────────────────────┐
│  Claude Desktop → Code tab      │
│  Opus 5 @ max effort            │   ← plans, reviews, never edits code
│  agent: architect               │
└───────────┬─────────────────────┘
            │  1. writes specs/001-thing.md
            │  2. runs `codex exec ...` in a terminal
            │  3. reads `git diff`, reviews against spec
            ▼
┌─────────────────────────────────┐
│  Codex CLI (headless)           │   ← writes the actual code
│  runs in your repo, sandboxed   │
└─────────────────────────────────┘
```

The important thing to understand up front: **the Claude desktop app you already
have contains a Code tab, and that Code tab *is* Claude Code.** Same agent files,
same settings files, same model and effort controls as the CLI — just with a GUI.
You are not switching tools. You're turning on a tab you may not have used yet.

The only genuinely new software is **Node.js** and the **Codex CLI**. You need the
Codex CLI (not just the Codex desktop app) because Claude drives Codex by running
a terminal command, and the desktop app has no command-line entry point.

You'll keep the Codex desktop app. It's still the nicer place to do hands-on
work. It just isn't the thing Claude can call.

---

## Part 0 — Prerequisite check

Run each of these in **PowerShell** (press `Win`, type `powershell`, hit Enter).
Write down which ones fail; the next parts fix them.

```powershell
git --version
node --version
codex --version
claude --version
```

| Command | What you want | If it fails |
|---|---|---|
| `git --version` | any version | Install Git for Windows — **Part 0a**. Required. |
| `node --version` | `v22.x` or higher | **Part 1** |
| `codex --version` | any version | **Part 2** |
| `claude --version` | any version | Optional. Skip it — the desktop Code tab doesn't need the CLI installed. |

### Part 0a — Git for Windows (only if `git --version` failed)

You said you have an existing Git repo, so this is probably already there. But
if the command failed, Git may have been installed by another tool in a way that
didn't put it on your PATH.

1. Download from **https://git-scm.com/downloads/win**
2. Run the installer. Accept every default — the defaults are correct, and one
   of them ("Git from the command line and also from 3rd-party software") is
   what puts `git` on your PATH.
3. **Close and reopen PowerShell**, then run `git --version` again.

> Git for Windows is not optional here. The Claude Desktop Code tab requires it
> on Windows, and it's what gives Claude a Bash shell instead of PowerShell —
> which makes the agent commands below behave consistently.

### Part 0b — Update Claude Desktop

In the Claude desktop app: **Help → Check for Updates**. Install anything
offered and restart the app.

You need v1.2581.0 or later for the pane layout and terminal used below. If you
installed the app recently you're almost certainly fine, but check anyway —
a stale build is the most common cause of "the menu you described isn't there."

If you don't have the desktop app at all, get it from
**https://claude.com/download**.

---

## Part 1 — Install Node.js

Skip if `node --version` already printed v22 or higher.

1. Go to **https://nodejs.org**
2. Download the **LTS** installer for Windows (the left-hand button).
3. Run it. Accept all defaults.
   - On the "Tools for Native Modules" screen, **leave the checkbox unticked**.
     You don't need Chocolatey or Python for this, and ticking it starts a long
     unrelated install.
4. **Close and reopen PowerShell.** This matters — PATH changes don't apply to
   already-open windows.
5. Verify:

```powershell
node --version
npm --version
```

Both should print version numbers. If `node` works but `npm` doesn't, reboot.

---

## Part 2 — Install and authenticate the Codex CLI

### 2.1 Install

In PowerShell:

```powershell
npm install -g @openai/codex
```

> **Get the package name exactly right.** It is `@openai/codex`, with the
> `@openai/` scope. The unscoped `codex` package on npm is an unrelated project
> from 2012 and will silently install the wrong thing.

Verify:

```powershell
codex --version
```

If you get `codex : The term 'codex' is not recognized`, close and reopen
PowerShell first — this is nearly always a stale PATH rather than a failed
install.

### 2.2 Authenticate

```powershell
codex login
```

This opens your browser for a "Sign in with ChatGPT" flow. Sign in with the same
account your Codex desktop app uses. Credentials are cached, so you only do this
once.

If the browser flow doesn't complete (common on locked-down machines), use the
device-code path instead:

```powershell
codex login --device-auth
```

That prints a short code you enter on another device. It requires device code
login to be enabled in your ChatGPT security settings.

### 2.2b If PowerShell blocks the script

Running `codex --version` may fail with:

```
codex : File C:\Users\...\npm\codex.ps1 cannot be loaded because running
scripts is disabled on this system.
```

This means Codex installed **correctly** — Windows is just blocking `.ps1`
files. Windows client editions ship with execution policy `Restricted`, and npm
creates a `.ps1` shim for global installs.

Check where you stand, then fix it for your user account only:

```powershell
Get-ExecutionPolicy -List
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Answer `Y`. No admin rights needed — `CurrentUser` scope writes to your own
registry hive.

`RemoteSigned` means locally-created scripts run, while internet-downloaded
scripts need a trusted signature. It's the standard developer setting and the
default on Windows Server. It is a real loosening, though: under `Restricted` a
malicious `.ps1` in your Downloads can't run at all; under `RemoteSigned` a
script *written locally by a running program* can. Fine for a dev machine, less
so for a shared family PC.

**If Group Policy blocks the change** (check `Get-ExecutionPolicy -List` — if
`MachinePolicy` or `UserPolicy` is anything but `Undefined`, IT has set it), use
`codex.cmd` everywhere this guide says `codex`. The `.cmd` shim bypasses
PowerShell script execution entirely. Running from `cmd.exe` also works —
execution policy is a PowerShell-only concept.

This doesn't affect Claude driving Codex either way: the Code tab uses Git Bash,
which resolves npm's extensionless shim and never consults execution policy.

### 2.3 Smoke test

The smoke test needs a **local clone**. `codex exec` runs against files on disk,
so a GitHub URL isn't something it can work in — and the Claude Code tab's
project folder has the same requirement. Clone once; both tools point at that
same folder.

```powershell
mkdir C:\Users\Jace\dev
cd C:\Users\Jace\dev
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
git status
```

Private repo? A browser window opens for GitHub sign-in — that's Git Credential
Manager, bundled with Git for Windows. Approve it and credentials are cached.

Two placement mistakes to avoid: **don't put the repo inside a OneDrive-synced
folder** (OneDrive fights Git over the thousands of small files in `.git`,
causing lock errors and phantom changes — check Documents and Desktop for the
cloud icon), and **avoid spaces in the path**.

Now run a read-only request from inside the repo:

```powershell
cd C:\path\to\your\repo
codex exec --sandbox read-only "List the top-level directories and say what this project appears to be."
```

**Do not continue until this works.** If Codex can't run from the command line
by itself, it won't work when Claude calls it, and you'll waste time debugging
the wrong layer.

> **A note on Windows and the Codex sandbox.** Codex runs a native Windows
> sandbox when invoked from PowerShell, which restricts writes to your working
> folder and blocks network access without approval. OpenAI's own app
> documentation presents this as production-ready, but some community sources
> still describe native Windows CLI support as rougher than the Linux path. If
> you hit sandbox errors you can't resolve, the fallback is to install Codex CLI
> inside WSL2 instead — but try native first, since your repo is on the Windows
> filesystem and crossing that boundary has its own costs.

---

## Part 3 — Scaffold your repo

Everything here goes in your existing repo. Four files. You can create them by
hand, or paste this whole section to Claude in the Code tab and have it do it.

### 3.1 `specs/` directory

```powershell
cd C:\path\to\your\repo
mkdir specs
```

This is the handoff surface. Claude writes here; Codex reads from here.

### 3.2 `AGENTS.md` (repo root)

Shared context both agents read. `AGENTS.md` became the cross-tool standard
after OpenAI proposed it in 2025 and it was donated to the Linux Foundation's
Agentic AI Foundation in December 2025. Claude Code, Codex, Cursor, Aider,
Copilot, Gemini CLI and Windsurf all read it natively — so this one file serves
both sides of your setup.

Create `AGENTS.md` at your repo root:

```markdown
# Project overview

<One paragraph: what this project is, primary language, framework, versions.>

# Build and test commands

- Install: <exact command>
- Build:   <exact command>
- Test:    <exact command>
- Lint:    <exact command>

# Code style

<Only rules that differ from the language defaults. Don't restate the obvious.>

# Rules for implementing agents

- Implement exactly what the spec in `specs/` describes. Nothing more.
- Do not refactor adjacent code, rename things, or "improve" what you touch.
- Do not add dependencies unless the spec names them explicitly.
- If the spec is ambiguous or appears wrong, stop and report. Do not guess.
- Run the test command before reporting success.
```

Fill in the angle-bracket placeholders with your real commands. This file is the
single highest-leverage thing in the whole setup — vague build commands here are
the number one cause of the executor flailing.

### 3.3 `.claude/agents/architect.md`

```powershell
mkdir .claude\agents
```

Create `.claude/agents/architect.md`:

```markdown
---
name: architect
description: Plans work and delegates implementation to the Codex CLI. Never writes application code.
model: opus
effort: max
tools: Read, Glob, Grep, Bash, Write
disallowedTools: Edit, NotebookEdit
---

You are a planning and review agent. You do not implement. Codex implements.

## Your loop

For each unit of work:

**1. Understand.** Read the relevant code first. Never write a spec against
code you haven't opened.

**2. Write the spec** to `specs/NNN-short-slug.md` using the template below.
Assume the executor has read `AGENTS.md` and nothing else — no memory of this
conversation, no knowledge of what you decided and why.

**3. Delegate.** Run exactly:

    codex exec --sandbox workspace-write "Implement specs/NNN-short-slug.md exactly as written. Do not deviate, refactor, or add scope. If the spec is ambiguous, stop and report rather than guessing."

**4. Review.** Run `git diff` and check the actual changes against your spec,
line by line. Then run the project's test command from AGENTS.md.

**5. Correct or continue.** If Codex deviated, write a correction spec and
re-run step 3. Do not fix the code yourself — if you're patching Codex's output
by hand, the spec was underspecified, and fixing the spec is what compounds.

## Spec template

    # NNN — <title>

    ## Goal
    <One sentence. What is true after this change that wasn't before.>

    ## Files to change
    - `path/to/file.ext` — <what changes>

    ## Changes
    <Precise. Function names, signatures, behavior. Enough that two competent
    developers would produce near-identical code from it.>

    ## Out of scope
    <Explicitly name the adjacent things NOT to touch. This section prevents
    more damage than any other.>

    ## Verification
    <Exact command to run, and what passing output looks like.>

## Rules

- One spec = one reviewable change. If a spec exceeds ~150 lines, split it.
- Never edit application code. Your only writes are to `specs/`.
- Never mark work complete on the basis of Codex's own summary. Read the diff.
```

### 3.4 `.claude/settings.json`

Create `.claude/settings.json`:

```json
{
  "agent": "architect",
  "permissions": {
    "allow": [
      "Bash(codex exec:*)",
      "Bash(git diff:*)",
      "Bash(git status:*)",
      "Bash(git log:*)"
    ],
    "deny": [
      "Bash(git push:*)",
      "Bash(git reset --hard:*)"
    ]
  }
}
```

Two things this does:

- **`"agent": "architect"`** makes every session in this project run the main
  thread as the architect — so Opus itself is the planner, not a subagent it
  delegates to. This is the piece that actually enforces the split.
- **The allow list** stops Claude prompting you for permission on every single
  `codex exec` call, which would defeat the point of automating the loop.

The deny rules are a seatbelt. Add more as you find them.

> **Honest caveat on enforcement.** `disallowedTools: Edit` blocks the Edit tool,
> but Claude still has Bash, and Bash can write files. The restriction is a
> speed bump that keeps Claude honest, not a sandbox that makes cheating
> impossible. If you want it airtight, add scoped `Write` deny rules for your
> source directories once you know your repo layout.

### 3.5 Commit the scaffolding

```powershell
git add AGENTS.md .claude specs
git commit -m "Add architect/executor agent scaffolding"
```

Committing now matters: your review step is `git diff`, and that only tells you
something useful if you start from a clean tree.

---

## Part 4 — Configure the Claude Desktop Code tab

1. Open the Claude desktop app.
2. Click the **Code** tab.
3. Click **+ New session**.
4. Set **Environment** to **Local**.
5. Set **Project folder** to your repo.
6. Press **Ctrl+Shift+I** to open the model menu → select **Opus**.
7. Press **Ctrl+Shift+E** to open the effort menu → select **max**.

On step 7 — `effort: max` is already in your `architect.md` frontmatter, so this
is belt-and-braces. Set it anyway the first time so you can see it took.

> **Why `max` needs re-selecting.** Unlike `low` through `xhigh`, the `max` level
> applies to the current session only and does not persist. The frontmatter
> handles this automatically for the architect agent. If you ever run without the
> agent, you'll need to re-select it each session, or set the environment
> variable `CLAUDE_CODE_EFFORT_LEVEL=max` to make it stick.

**Verify the agent loaded.** In the chat box, type `/agents` and confirm
`architect` appears. If it doesn't, restart the app — a running session won't
detect a `.claude/agents/` directory that didn't exist when it started.

**If the main thread isn't behaving as the architect** (i.e. Claude starts
editing code directly instead of writing specs), the `agent` settings key may not
be applying in your app version. Two fallbacks, either of which works:

- `@agent-architect` at the start of your message to invoke it explicitly, or
- copy the body of `architect.md` into a `CLAUDE.md` at your repo root, which the
  Code tab reads automatically into the main thread.

---

## Part 5 — Test run

Do this on something deliberately trivial. You are testing the *plumbing*, not
the intelligence. Pick something where you'll instantly recognize a wrong answer.

In the Code tab, ask for something small and real. For example:

> Add a `--version` flag to the CLI entry point that prints the version from
> package.json and exits 0.

Watch for these four things in order. If any one doesn't happen, stop and fix
that before going further:

1. **A spec file appears** in `specs/`. Open it. Is it precise enough that *you*
   could implement it without asking questions? If not, the spec quality problem
   will only get worse on harder tasks.
2. **A `codex exec` command runs** in the terminal pane. If it prompts you for
   permission, your `.claude/settings.json` allow rule isn't matching — check for
   a typo.
3. **Claude runs `git diff` and comments on the actual changes.** If it just
   repeats Codex's summary back at you, tighten step 4 in the architect prompt.
   This is the step people most often let slide, and it's the one that catches
   silent scope drift.
4. **Tests run and pass.**

---

## Part 6 — The daily loop

Once it works, your rhythm is:

1. Describe the outcome you want, in the Code tab, in plain language.
2. Let Opus plan. **Read the spec before letting it delegate** — this is your
   real leverage point. Catching a bad assumption in the spec costs you one
   sentence; catching it in the diff costs a full round trip.
3. Let it run Codex and review.
4. Commit when the diff is clean.

Ask Claude to plan the whole piece of work as numbered specs up front, then
execute them one at a time. Reviewing a sequence of small specs is far easier
than reviewing one large one, and a failed step doesn't contaminate the rest.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `codex` not recognized in PowerShell | Stale PATH | Close and reopen PowerShell. If it persists, reboot. |
| `codex.ps1 cannot be loaded ... running scripts is disabled` | PowerShell execution policy | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` — see Part 2.2b |
| `codex` works in PowerShell but not from Claude | Claude uses Git Bash, which has its own PATH | Run `where codex` in PowerShell, then have Claude call the full path |
| Claude prompts for permission on every codex call | Allow rule not matching | Check `.claude/settings.json` for typos; the syntax is `Bash(codex exec:*)` |
| `architect` missing from `/agents` | Directory created after session start | Restart the desktop app |
| Codex sandbox write errors | Native Windows sandbox restriction | Confirm you're running from inside the repo; if unresolvable, consider WSL2 |
| Codex implements the wrong thing | Underspecified spec | Fix the spec, not the code. Add an explicit "Out of scope" section. |
| Claude edits code itself | Prompt drift | Re-read `architect.md`; consider scoped Write deny rules |

---

## What determines whether this actually pays off

Worth being clear-eyed about, since the setup cost is real:

**The executor has zero shared context.** Every `codex exec` call is a cold
start. Opus at max effort will happily produce a plan that reads beautifully to
you — because you have the conversation in your head — and is badly
underspecified for a model that doesn't. The "Out of scope" section is doing more
work than it looks like.

**The review step is the whole thing.** A planner that delegates and doesn't
verify is strictly worse than just letting Opus write the code, because you've
added a translation loss and removed the author's own quality check. If you find
yourself skipping `git diff`, the setup has stopped earning its keep.

**Spec-writing tokens aren't free.** Opus at max effort writing a detailed spec
is not a cheap operation. On small, well-understood changes, the round trip
costs more than just doing it directly. This pattern earns its cost on work
that's *large or repetitive* — where one careful plan drives many mechanical
edits. Use it there; don't use it to add a log line.

**You're spending two quotas.** Claude usage and ChatGPT/Codex usage draw down
separately. That's often the point — it's two budgets instead of one bottleneck —
but it's worth knowing before you're surprised by it.

**Start looser than you think.** Run the manual version for a few tasks first
(read the spec, run Codex yourself, review) before trusting the automated loop.
You'll learn what your specs are missing much faster when you feel each gap
directly.

---

## Sources

- [Claude Code desktop app](https://code.claude.com/docs/en/desktop)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Model and effort configuration](https://code.claude.com/docs/en/model-config)
- [Claude Code permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code advanced setup](https://code.claude.com/docs/en/setup)
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Codex sandboxing](https://developers.openai.com/codex/concepts/sandboxing)
- [Codex authentication](https://developers.openai.com/codex/auth)
- [Codex Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [AGENTS.md standard](https://www.morphllm.com/agents-md-guide)
