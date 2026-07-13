# Repository Audit Command Log

## LOG-001 — Initial Git snapshot

- Command: `$repo = 'C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work'; git -c safe.directory=$repo -C $repo rev-parse --show-toplevel; git -c safe.directory=$repo -C $repo branch --show-current; git -c safe.directory=$repo -C $repo rev-parse HEAD; git -c safe.directory=$repo -C $repo status --short --branch`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix`
- Purpose: Locate the real checkout and capture branch, commit, tracking state, and all pre-existing changes before the audit writes anything.
- Exit code: 0.
- Result: Checkout found at `repo-v27-work`; branch `codex/apply-b67e055`; commit `1770f1ea00b9d86df77366b835d09999204177b9`; working tree already contained 13 modified and 2 untracked application files.
- Files changed: None.
- Related findings: None.

## LOG-002 — Environment versions (first attempt)

- Command: `[PSCustomObject]@{ Timestamp=(Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK'); PowerShell=$PSVersionTable.PSVersion.ToString(); Git=(git --version); Node=(node --version); Npm=(npm --version) } | Format-List`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix`
- Purpose: Record the audit environment.
- Exit code: 0 at the shell wrapper, with a PowerShell security error from `npm.ps1`.
- Result: PowerShell execution policy blocked `npm.ps1`; the command did not produce the intended combined version record.
- Relevant error: `PSSecurityException: npm.ps1 cannot be loaded because running scripts is disabled on this system.`
- Files changed: None.
- Related findings: None; environment limitation only.

## LOG-003 — Environment versions via npm.cmd

- Command: `[PSCustomObject]@{ Timestamp=(Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK'); PowerShell=$PSVersionTable.PSVersion.ToString(); Git=(git --version); Node=(node --version); Npm=(& npm.cmd --version) } | Format-List`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Record tool versions while bypassing the local PowerShell script-policy issue.
- Exit code: 0.
- Result: Timestamp `2026-07-10T15:24:41-04:00`; PowerShell 5.1.26100.8655; Git 2.55.0.windows.2; Node v24.18.0; npm 11.16.0.
- Files changed: None.
- Related findings: None.

## LOG-004 — Initialize resumable audit files

- Command: `apply_patch` adding `.audit/AUDIT_PROGRESS.md`, `.audit/AUDIT_FINDINGS_DRAFT.md`, and `.audit/AUDIT_COMMAND_LOG.md`.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix`
- Purpose: Create the only prompt-authorized persistent audit files.
- Exit code: 0.
- Result: Audit checkpoint structure created without touching application files.
- Files changed: The three `.audit/` files only.
- Related findings: None.

## LOG-005 — Repository inventory and contract/configuration read

- Command: `rg --files -g '!node_modules/**' -g '!.git/**' -g '!.audit/**'` followed by read-only `Get-Content` of `package.json`, `.github/workflows/pages.yml`, `wrangler.jsonc`, `README.md`, `HANDOFF.md`, `UPDATING.md`, `TESTING.md`, and `manifest.webmanifest`, plus file-size/SHA-256 inventory of application entry points.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Establish repository scope, documented product contract, release process, CI checks, and immutable audit fingerprints.
- Exit code: 0.
- Result: 47 non-audit repository files identified; static PWA, local planner/Hexlaces state, network-first service worker, and Worker/KV configuration confirmed. Entry-point hashes were recorded in command output for later change detection.
- Files changed: None.
- Related findings: Documentation/version consistency remains under review.

## LOG-006 — Full automated test suite

- Command: `npm.cmd test`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Run the package-defined GitHub Actions-equivalent test command.
- Exit code: 0.
- Result: 27 tests passed, 0 failed; the trailing schedule validator also passed. Duration approximately 3.66 seconds.
- Files changed: None.
- Related findings: None yet; passing tests do not establish browser, iOS, offline-cache, or production-concurrency correctness.

## LOG-007 — Standalone schedule validation

- Command: `npm.cmd run validate:schedule`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Run the documented festival-time schedule-only safety check independently.
- Exit code: 0.
- Result: `Schedule validation passed.`
- Files changed: None.
- Related findings: None.

## LOG-008 — JavaScript syntax checks

- Command: `$files = rg --files -g '*.js' -g '*.mjs' -g '!node_modules/**' -g '!.audit/**'; foreach ($file in $files) { node --check $file }`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Cover application, Worker, test, and validation scripts where no lint/type-check/build script exists.
- Exit code: 0.
- Result: Syntax passed for all 22 JavaScript and `.mjs` files.
- Files changed: None.
- Related findings: None.

## LOG-009 — Diff hygiene and Wrangler availability

- Command: `git -c safe.directory='C:/Users/Jace/Downloads/shambhala-stage-schedule-search-fix/repo-v27-work' diff --check; wrangler.cmd --version`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Detect whitespace errors and verify whether the CI Worker bundler can be reproduced locally.
- Exit code: 0 at wrapper level.
- Result: `git diff --check` passed with expected LF-to-CRLF warnings. Wrangler reported 4.108.0 but could not write a diagnostic log to its default roaming-profile path due sandbox `EPERM`; no bundle was attempted in this command.
- Files changed: None.
- Related findings: Environment limitation only.

## LOG-010 — Post-check working-tree verification

- Command: `git -c safe.directory='C:/Users/Jace/Downloads/shambhala-stage-schedule-search-fix/repo-v27-work' status --short`
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Confirm automated checks did not modify application files.
- Exit code: 0.
- Result: Application-file state exactly matched the initial snapshot; only the expected new `.audit/` directory was added by the audit.
- Files changed: None.
- Related findings: None.

## LOG-011 — Isolated dependency installation and Wrangler CI dry-run (sandbox attempts)

- Command: Create a scratch copy excluding `.git`, `.audit`, and `node_modules`; run `npm.cmd install --ignore-scripts --no-audit --no-fund`; set `WRANGLER_LOG_PATH`; run `wrangler.cmd deploy --dry-run --outdir <scratch>/wrangler-out`; verify and remove the scratch directory.
- Working directories: First `%TEMP%\shambhala-audit-wrangler-<guid>`, then `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\.audit-scratch-wrangler-<guid>`.
- Purpose: Reproduce dependency installation and the GitHub Actions Worker bundle/config validation without altering the checkout.
- Exit code: 1 for both sandboxed dry-run attempts; npm installation itself returned 0.
- Result: With no package dependencies, npm reported `up to date` and generated only scratch metadata. Wrangler 4.108.0 was blocked by the filesystem sandbox while traversing ancestor directories (`Cannot read directory ... Access is denied`) and could not resolve the copied Worker entry point. Both scratch directories were verified inside their intended roots and removed.
- Files changed: Scratch files only, then removed; checkout unchanged.
- Related findings: Environment limitation only.

## LOG-012 — Isolated dependency installation and Wrangler CI dry-run (approved outside sandbox)

- Command: Same isolated scratch-copy command as LOG-011, run with approved unsandboxed execution; `npm.cmd install --ignore-scripts --no-audit --no-fund`; `wrangler.cmd deploy --dry-run --outdir <scratch>/wrangler-out`; verified recursive cleanup of only the unique scratch path.
- Working directory: Scratch directory directly under `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix`, sourced from `repo-v27-work`.
- Purpose: Complete the CI-equivalent Worker bundling/configuration validation after the sandbox-only failure.
- Exit code: 0.
- Result: npm install passed with no dependencies. Wrangler 4.108.0 dry-run passed; bundle `14.75 KiB`, gzip `4.18 KiB`; `env.LISTS` KV binding resolved. Wrangler explicitly exited in dry-run mode; nothing deployed. Scratch `.wrangler`, output, lock, and log files were listed, then the verified scratch directory was removed.
- Files changed: Scratch files only, then removed; checkout unchanged.
- Related findings: None; this proves bundle/config syntax, not runtime KV semantics.

## LOG-013 — Worker concurrency, consistency, limiter, expiry, and body-size probes

- Command: Inline ESM imported `./worker/src/index.js` and executed controlled `BarrierKv`, `StaleKv`, `OneWritePerSecondKv`, and memory-KV harnesses via PowerShell here-string piped to `node --input-type=module`.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Exercise platform semantics that the immediate/unlimited `MemoryKv` unit tests cannot model, without accessing production KV.
- Exit code: 0 for completed harnesses. One initial `node --input-type=module -e $code` attempt failed with a quoting `SyntaxError`; piping the identical source over stdin passed.
- Result: (1) Concurrent claims both returned accepted and the later scan became final owner. (2) A stale old-owner auth read allowed PUT 200 and restored the old key after an earlier-scan takeover. (3) Concurrent revision-1 PUTs both returned revision 2 and one silently overwrote the other. (4) Concurrent handoff redeems both returned credentials. (5) A modeled documented one-write/second KV limit produced create 201 then 400 at request 2/120. (6) Expired ping data remained in GET. (7) A 1,048,615-byte body with an ignored 1 MiB field returned 201.
- Files changed: None.
- Related findings: AUDIT-001, AUDIT-002, AUDIT-003, AUDIT-004, AUDIT-008, AUDIT-009.

## LOG-014 — Service-worker install and cross-release VM probes

- Command: Inline Node `vm` harness loaded the actual `sw.js` with controlled Cache Storage/fetch implementations for rejected and never-settling assets, plus a v47-cache/v48-server periodic-sync scenario.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Test lifecycle/offline failure modes that ordinary Node unit tests do not cover.
- Exit code: 0.
- Result: Never-settling optional AMP art left installation `pending-after-50ms`; rejecting only `qrcode.js` rejected the whole install; old-worker sync cached a shell referencing `app.js?v=48`, retained only the old app key, and lacked the new app key.
- Files changed: None.
- Related findings: AUDIT-005, AUDIT-006.

## LOG-015 — Schedule, URL, preview, storage, and asset analysis probes

- Command: Read-only Node/PowerShell probes over schedule data and source plus `Get-Item`, `Get-FileHash`, and image metadata inspection.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Verify preview examples/boundaries, overlap behavior, final-set rendering inputs, NFC URL sizes, precache weight, art dimensions, and data-flow assumptions.
- Exit code: 0.
- Result: Documented preview examples matched; malformed planner preview diverged; current schedule contains 131 potential 1-19-minute overlaps; final Thursday AMP row derived Friday's 5 PM end; personal/giveaway links measured about 77/96 UTF-8 bytes; total declared precache about 1.7 MB raw with about 740 KB fonts.
- Files changed: None.
- Related findings: AUDIT-005, AUDIT-013, AUDIT-014, AUDIT-023, AUDIT-031.

## LOG-016 — Static accessibility/mobile/performance checks and local server

- Command: Full numbered source reads; duplicate/static-reference checks for IDs, labels, `aria-controls`, and `aria-labelledby`; WCAG luminance calculations; local Python HTTP server on `127.0.0.1:8765` with HTTP GET; server stopped after check.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Perform source-backed mobile/accessibility/performance review and confirm the static site serves locally.
- Exit code: 0.
- Result: Local site returned 200; static references resolved; Pagoda/Village contrast failures confirmed; selected-style/focus, periodic rerender, unbounded friend, clear, and fallback issues confirmed. Server was stopped and repository status unchanged.
- Files changed: None.
- Related findings: AUDIT-018 through AUDIT-021, AUDIT-025, AUDIT-030, AUDIT-031.

## LOG-017 — Browser/performance runtime discovery

- Check: Chrome DevTools performance command discovery, in-app browser runtime setup, `getForUrl('http://127.0.0.1:8765/')`, and browser list/troubleshooting.
- Purpose: Run requested interactive viewport, accessibility-tree, screenshot, and Core Web Vitals checks.
- Result: Chrome DevTools MCP was not configured; the browser runtime reported `No browser is available` and an empty browser list. Per browser/performance guidance, no unrelated browser automation substitute was used.
- Files changed: None.
- Related findings: None; blocked runtime/device limitation.

## LOG-018 — Public deployment read-only checks

- Command: `Invoke-WebRequest` HEAD/GET for the public Pages root/index and Worker root/health; cache-busting query; regex extraction of the release marker. Initial custom GET failed inside the network sandbox and was rerun with approved read-only network access.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Validate documented public release markers, HTTP caching, and Worker health without reading lists/user data.
- Exit code: 0 for successful checks.
- Result: Pages HTTP 200, `Cache-Control: max-age=600`, ETag present, live marker `<!-- v46 -->`; Worker root HTTP 200 with expected API text; `/health` HTTP 404. The audited working tree is v47/uncommitted and therefore not the live revision.
- Files changed: None.
- Related findings: Deployment status/limitation, not a repository defect by itself.

## LOG-019 — Current platform, accessibility, browser, and vendored-dependency reference checks

- Check: Read current official Cloudflare KV/Durable Objects/Wrangler/Worker-limit documentation, W3C contrast guidance, WebKit storage/iPad/PWA documentation, browser `color-mix()` support, npm/GitHub advisory metadata for `qrcode-generator`.
- Purpose: Verify platform-specific claims rather than relying on stale model knowledge or generic scanner labels.
- Result: Current docs confirm KV eventual consistency/non-atomicity and one-write/second/same-key behavior; Durable Objects provide per-entity coordination/strong storage; no applicable published advisory was found for the dependency-free vendored QR library during the search.
- Files changed: None.
- Related findings: AUDIT-001 through AUDIT-004, AUDIT-009, AUDIT-012, AUDIT-019, AUDIT-025.

## LOG-020 — Official 2026 schedule-source availability check

- Check: Web search/open against official Shambhala 2026 directory/home/lineup sources for a downloadable or machine-comparable set-time schedule.
- Purpose: Independently validate artist/time transcription where possible.
- Result: Official public pages direct users to the 2026 mobile app for set times; the directory's downloadable schedule was not available as a comparable stage-time source. Repository structure/order validation passed, but individual transcription accuracy remains unverified.
- Files changed: None.
- Related findings: External verification limitation only.

## LOG-021 — Final automated suite and clean-state verification

- Command: `npm.cmd test` in parallel with `git ... status --short --branch` and timestamp capture.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Confirm the final audited state and prove the audit introduced no application changes.
- Exit code: 0.
- Result: 27 tests passed, 0 failed; schedule validation passed. Final application-file status exactly matched the initial dirty snapshot; only `.audit/` was added by the audit.
- Files changed: None beyond the three permitted audit checkpoint files.
- Related findings: None.

## LOG-022 — Checkpoint integrity verification

- Command: Count `### AUDIT-` headings and severity lines in `AUDIT_FINDINGS_DRAFT.md`; verify all three audit files exist; run final `git status --short --branch`.
- Working directory: `C:\Users\Jace\Downloads\shambhala-stage-schedule-search-fix\repo-v27-work`
- Purpose: Verify resumability records and final finding counts before delivery.
- Exit code: 0.
- Result: 32 findings total: 6 High, 16 Medium, 10 Low; all three checkpoint files exist; application status remains identical to the initial snapshot plus `.audit/`.
- Files changed: None beyond this command-log checkpoint update.
- Related findings: None.
