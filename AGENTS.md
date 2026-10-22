# Heynote — notes for coding agents

Heynote is an Electron + Vue 3 desktop scratchpad (macOS, Windows, Linux). The Electron main process lives in `electron/`, the renderer in `src/`, the browser-only build in `webapp/`.

## Build and test (all platforms)

Requires Node.js 24 (LTS). Run from the repo root.

| Step | Command | Typical time |
| --- | --- | --- |
| Install deps | `npm ci` (see "Install gotcha" below) | ~40 s |
| Install Playwright browser | `npx playwright install chromium` | ~10 s |
| Build Electron bundles (`dist-electron/`) | `npx vite build` | ~15 s |
| Type-check | `npx vue-tsc --noEmit` | ~5 s |
| Unit tests (main process) | `npx vitest run` (`npm run test:main` starts watch mode) | ~2 s |
| Renderer tests in Chromium | `npm test` (= `playwright test --grep-invert @e2e`) | ~5 min |
| **Electron end-to-end tests** | `npm run test:e2e` (= `playwright test --grep @e2e`, use `--project electron --reporter=list`) | ~1 min |
| Run the app | `npm run dev` (Vite dev server + Electron with hot reload) | — |

Platform notes:
- **Linux (headless VMs):** prefix Playwright commands with `xvfb-run --auto-servernum`. Electron needs `--no-sandbox` (already passed by the e2e specs). The image-paste e2e test is occasionally flaky under Xvfb; rerun it once before treating it as a failure.
- **macOS:** run tests directly; a real Heynote window appears for Electron tests. Node via Homebrew (`brew install node@24`) if missing.
- **Windows:** run tests directly in PowerShell or Git Bash; a real Heynote window appears. Node via `winget install OpenJS.NodeJS.LTS` if missing. Playwright's Electron project is the only one that needs a display.

### Install gotcha (Devin VMs / shared egress IPs)
`@vscode/ripgrep`'s postinstall downloads a binary via the GitHub API and fails with HTTP 403 when the IP is rate-limited. If `npm ci` fails there:
```
npm ci --ignore-scripts
node node_modules/electron/install.js
npx patch-package
```
then download `ripgrep-v15.0.0-<target>.{tar.gz|zip}` from https://github.com/microsoft/ripgrep-prebuilt/releases/tag/v15.0.0 and unpack the `rg` binary into `node_modules/@vscode/ripgrep/bin/` (`rg.exe` on Windows). Targets: `x86_64-unknown-linux-musl`, `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-msvc`.

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
- Do not commit `dist/`, `dist-electron/`, `release/`, or `test-results/`.
- Verification of a change must be shown by real test output on the platform(s) it affects; the Linux e2e run skips the login-item tests, so Windows/macOS-specific changes must be exercised on those platforms.
