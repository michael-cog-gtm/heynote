import { test, expect, _electron as electron } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'

import { HeynotePage } from "./test-utils.js"

const isLinux = process.platform === 'linux'
const supportsOpenAtLogin = process.platform === 'darwin' || process.platform === 'win32'

// Skip at declaration time so beforeEach/afterEach do not launch and tear down
// Electron for tests that cannot run on this platform.
const loginItemTest = supportsOpenAtLogin ? test : test.skip
const linuxOnlyTest = isLinux ? test : test.skip

// On Windows the login item is registered with a command-line argument (see
// registerOpenAtLogin in electron/main/index.ts) and app.getLoginItemSettings()
// only reports it as enabled when queried with the same args.
const OPEN_AT_LOGIN_ARG = "--heynote-open-at-login"
const loginItemQuery = process.platform === 'win32' ? { args: [OPEN_AT_LOGIN_ARG] } : {}

async function ensureElectronBuild() {
    const mainPath = path.join(process.cwd(), 'dist-electron', 'main', 'index.js')
    const preloadPath = path.join(process.cwd(), 'dist-electron', 'preload', 'index.js')
    try {
        await fs.stat(mainPath)
        await fs.stat(preloadPath)
        return
    } catch {
        // build below
    }

    await new Promise((resolve, reject) => {
        const child = spawn('npx', ['vite', 'build'], {
            stdio: 'inherit',
            env: {
                ...process.env,
            },
        })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`vite build failed with exit code ${code}`))
        })
    })
}

async function dirExists(dirPath) {
    try {
        const stat = await fs.stat(dirPath)
        return stat.isDirectory()
    } catch (err) {
        if (err.code === "ENOENT") return false
        throw err
    }
}

async function removeDirWithRetry(dirPath, retries = 10) {
    // On Windows, Electron/Chromium can keep files (e.g. the DIPS database) locked
    // for a short while after the process exits, which surfaces as EBUSY/EPERM.
    const retryable = new Set(["ENOTEMPTY", "EBUSY", "EPERM"])
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            await fs.rm(dirPath, { recursive: true, force: true })
            return
        } catch (err) {
            if (!retryable.has(err.code) || attempt === retries) {
                throw err
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        }
    }
}

async function closeElectronApp(electronApp) {
    if (!electronApp) return
    const childProcess = electronApp.process()
    const hasExited = () => !childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null
    const waitForExit = () => {
        if (hasExited()) {
            return Promise.resolve()
        }
        return new Promise((resolve) => childProcess.once('exit', resolve))
    }
    const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    await Promise.race([electronApp.close(), timeout(5000)])
    await Promise.race([waitForExit(), timeout(1000)])
    if (hasExited()) {
        return
    }

    // Force kill if still running, then wait so the next launch cannot race
    // against late config writes from this process.
    if (process.platform === 'win32') {
        // SIGKILL only reaches the main process on Windows; renderer/GPU
        // children keep user-data files locked, so kill the whole tree.
        spawnSync('taskkill', ['/pid', String(childProcess.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
        childProcess.kill('SIGKILL')
    }
    await Promise.race([waitForExit(), timeout(5000)])
}


test.describe('openAtLogin e2e', { tag: "@e2e" }, () => {
    test.describe.configure({ mode: 'serial' })
    test.skip(({ browserName }) => browserName !== 'chromium', 'Electron runs only once under chromium')

    /** @type {HeynotePage} */
    let heynotePage
    let electronApp
    let tmpRoot
    let userDataDir
    let page

    test.beforeEach(async () => {
        test.setTimeout(60000)
        await ensureElectronBuild()
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'heynote-e2e-login-'))
        userDataDir = path.join(tmpRoot, 'user-data')
        await fs.mkdir(userDataDir)

        electronApp = await electron.launch({
            args: ['--no-sandbox', 'tests/playwright/electron-runner.cjs'],
            env: {
                ...process.env,
                HEYNOTE_TEST_USER_DATA_DIR: userDataDir,
            },
        })

        page = await electronApp.firstWindow()
        await page.waitForLoadState('domcontentloaded')
        heynotePage = new HeynotePage(page)
    })

    test.afterEach(async () => {
        await closeElectronApp(electronApp)
        electronApp = null
        if (await dirExists(tmpRoot)) {
            await removeDirWithRetry(tmpRoot)
        }
    })

    loginItemTest('Launch at login checkbox is visible in Electron', async () => {
        await expect(page).toHaveTitle(/Heynote/i)
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Launch at login")
        await expect(checkbox).toBeVisible()
    })

    linuxOnlyTest('Launch at login checkbox is hidden in Electron on Linux', async () => {
        await expect(page).toHaveTitle(/Heynote/i)
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Launch at login")
        await expect(checkbox).toHaveCount(0)
    })

    loginItemTest('Launch at login default is unchecked', async () => {
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Launch at login")
        await expect(checkbox).not.toBeChecked()
    })

    loginItemTest('Toggle Launch at login updates config file', async () => {
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Launch at login")
        await checkbox.click()
        await expect(checkbox).toBeChecked()

        // Wait for config to be written to disk
        const configPath = path.join(userDataDir, 'config.json')
        await expect.poll(async () => {
            try {
                const raw = await fs.readFile(configPath, 'utf-8')
                const config = JSON.parse(raw)
                return config.settings?.openAtLogin
            } catch {
                return undefined
            }
        }).toBe(true)
    })

    test('Toggle Start hidden updates config file', async () => {
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Start hidden")
        await checkbox.click()
        await expect(checkbox).toBeChecked()

        const configPath = path.join(userDataDir, 'config.json')
        await expect.poll(async () => {
            try {
                const raw = await fs.readFile(configPath, 'utf-8')
                const config = JSON.parse(raw)
                return config.settings?.startHidden
            } catch {
                return undefined
            }
        }).toBe(true)
    })

    loginItemTest('Toggle Launch at login updates Electron loginItemSettings', async () => {
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Launch at login")
        await checkbox.click()
        await expect(checkbox).toBeChecked()

        // Verify Electron's loginItemSettings
        const loginSettings = await electronApp.evaluate(({ app }, query) => {
            return app.getLoginItemSettings(query)
        }, loginItemQuery)
        expect(loginSettings.openAtLogin).toBe(true)
    })

    loginItemTest('Toggle Launch at login off resets loginItemSettings', async () => {
        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
        const checkbox = page.getByLabel("Launch at login")

        // Toggle on
        await checkbox.click()
        await expect(checkbox).toBeChecked()

        // Toggle off
        await checkbox.click()
        await expect(checkbox).not.toBeChecked()

        // Verify Electron's loginItemSettings is reset
        const loginSettings = await electronApp.evaluate(({ app }, query) => {
            return app.getLoginItemSettings(query)
        }, loginItemQuery)
        expect(loginSettings.openAtLogin).toBe(false)
    })

    test('windowConfig.visibleOnQuit is saved on app close', async () => {
        // The window is visible, so closing should save visibleOnQuit: true.
        const configPath = path.join(userDataDir, 'config.json')

        // Close the app gracefully
        await closeElectronApp(electronApp)
        electronApp = null

        // Read config and verify visibleOnQuit was saved.
        await expect.poll(async () => {
            try {
                const raw = await fs.readFile(configPath, 'utf-8')
                const config = JSON.parse(raw)
                return config.windowConfig?.visibleOnQuit
            } catch {
                return undefined
            }
        }).toBe(true)
    })
})
