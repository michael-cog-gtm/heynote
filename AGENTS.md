# Heynote — notes for coding agents

Heynote is an Electron + Vue 3 desktop scratchpad (macOS, Windows, Linux). The Electron main process lives in `electron/`, the renderer in `src/`, the browser-only build in `webapp/`.

## Build and test (all platforms)

Requires Node.js 24 (LTS). Run from the repo root.

| Step | Command | Typical time |
| --- | --- | --- |
| Install deps + Playwright Chromium | `bash scripts/install-deps.sh` (Windows: `"C:/Program Files/Git/bin/bash.exe" scripts/install-deps.sh`; never plain `npm ci`, see below) | Linux ~50 s, macOS ~15 s, Windows ~2.5 min |
| Build Electron bundles (`dist-electron/`) | `npx vite build` | ~15 s |
| Type-check | `npx vue-tsc --noEmit` | ~5 s |
| Unit tests (main process) | `npx vitest run` (`npm run test:main` starts watch mode) | ~2 s |
| Renderer tests in Chromium | `npm test` (= `playwright test --grep-invert @e2e`) | ~5 min |
| **Electron end-to-end tests** | `npm run test:e2e` (= `playwright test --grep @e2e`, use `--project electron --reporter=list`) | ~1 min |
| Run the app | `npm run dev` (Vite dev server + Electron with hot reload) | — |

Platform notes:
- **Linux (headless VMs):** prefix Playwright commands with `xvfb-run --auto-servernum`. Electron needs `--no-sandbox` (already passed by the e2e specs). The image-paste e2e test is occasionally flaky under Xvfb; rerun it once before treating it as a failure.
- **macOS:** run tests directly; a real Heynote window appears for Electron tests. Devin macOS machines have Node 24 via Homebrew.
- **Windows:** run tests from Git Bash or PowerShell; a real Heynote window appears. Use a current **Node 24 LTS** (`C:\Program Files\nodejs`, installed from the nodejs.org MSI with `msiexec /i <file> /qn /norestart` **from PowerShell** — from Git Bash the flags get mangled and msiexec hangs). Do not use the preinstalled `C:\hostedtoolcache\node\24.0.1` (Playwright fails at import on 24.0.x: `context.conditions?.includes is not a function`) or the Node 20 on PATH. In Devin's non-TTY shell `bash` resolves to the WSL stub, so the bare `npm`/`npx` shims fail with "No such file or directory": use `npm.cmd` / `npx.cmd`, and run the install script as `"C:/Program Files/Git/bin/bash.exe" scripts/install-deps.sh`. `winget` is not available. Use PowerShell for process management (`Stop-Process -Name electron -Force`). Cold `install-deps.sh` takes ~2.5 min here (npm on NTFS).

### Install gotcha (why not plain `npm ci`)
`@vscode/ripgrep`'s postinstall downloads a binary via the GitHub API and fails with HTTP 403 from rate-limited/shared IPs (Devin VMs); plain `npm ci` then retries for ~20 minutes before failing. `scripts/install-deps.sh` does the equivalent safely on all three platforms: `npm ci --ignore-scripts`, `node node_modules/electron/install.js`, `npx patch-package`, fetches the matching `rg` binary from https://github.com/microsoft/ripgrep-prebuilt/releases/tag/v15.0.0 into `node_modules/@vscode/ripgrep/bin/`, and installs Playwright's Chromium.

## Where the tests live
- `tests/playwright/*-e2e.spec.js` — Electron end-to-end tests (tag `@e2e`, Playwright project `electron`). They launch the real app via `tests/playwright/electron-runner.cjs` with a temporary user-data dir (`HEYNOTE_TEST_USER_DATA_DIR`).
  - `open-at-login-e2e.spec.js` — Settings → "Launch at login" / "Start hidden"; these tests only run on macOS and Windows (skipped on Linux because Linux has no login-item API).
  - `electron-e2e.spec.js`, `buffer-tree-e2e.spec.js` — buffers on disk, image paste, folder tree.
- `tests/playwright/*.spec.js` (no `-e2e`) — renderer tests run in Chromium against the web build (`npx vite --port=3000 webapp` is started automatically by `playwright.config.ts`).
- `tests/main/` — vitest unit tests for the main process.
- `tests/playwright/test-utils.js` — `HeynotePage` helper (open settings, read buffers, etc.).

## Platform-specific code map
- `electron/detect-platform.ts` exports `isMac`, `isWindows`, `isLinux`, `isDev`.
- `electron/main/index.ts` — window/tray/dock behaviour, `registerOpenAtLogin()` (login item via `app.setLoginItemSettings`; Windows needs `args` so the app can start hidden).
- `electron/preload/index.ts` exposes `window.heynote.platform.{isMac,isWindows,isLinux,isWebApp}` to the renderer.
- `src/components/settings/Settings.vue` — Settings dialog; "Window / Application" section has per-platform options (dock, menu bar/tray, launch at login, start hidden).
- `src/components/StatusBar.vue` — shows `⌘` on macOS and `Ctrl` elsewhere.

## Conventions
- 4-space indentation, no semicolons in JS/TS/Vue, double quotes in Vue/JS.
- Keep platform conditionals explicit (`isMac`, `isWindows`, `isLinux`); Windows and macOS both support login items, Linux does not.
- Add or extend a Playwright test for any behaviour change; e2e tests for anything in the Electron main process or Settings.
- Do not commit `dist/`, `dist-electron/`, `release/`, or `test-results/`. Running the app or the e2e suite can leave `docs/index.md` modified (a trailing newline); discard that with `git checkout -- docs/index.md`, never commit it.
- Verification of a change must be shown by real test output on the platform(s) it affects; the Linux e2e run skips the login-item tests, so Windows/macOS-specific changes must be exercised on those platforms.

## Verifying changes that touch macOS or Windows behaviour (required)

Linux cannot exercise login items, dock/tray, or OS keyboard conventions, so a Linux session must get real evidence from the other platforms instead of reasoning about it:

1. Push the fix to a branch and, in parallel, start one child session on a **macOS** machine and one on a **Windows** machine (platform `macos` / `windows`). Children do not share your filesystem, so put the full instructions inline in the child prompt (never a `file://` path). Give each child the branch name, the one-sentence description of the bug, and ask it to: read this file; build `main` and run the Electron e2e tests (before); build the branch and run them again (after); use its testing agent to record a short chaptered recording of the real app showing the behaviour (Settings → Launch at login → toggle → restart), plus a screenshot; and report the verbatim pass/fail/skip summaries and timings. Children must not change code or touch the PR. Recording: one chaptered recording per child, under ~2 minutes; if the recording tool's post-processing/render step fails, retry at most once, then attach the raw capture with chapters and say so — do not spend more time on it. Children run from a machine image that already has `node_modules` and `dist-electron/` (run `bash scripts/install-deps.sh` only if `node_modules` is missing).
2. Collect each child's recording and screenshot (session attachments) and post them in **one PR comment** with a two-column table (macOS | Windows), the before/after test summaries per platform, and links to the child sessions. Also link the recordings from the PR description.
3. Post a short summary (what was broken, what changed, evidence per platform, PR link) to the Slack channel named in the task, if one is named.
4. Never merge; leave the PR open for review.
