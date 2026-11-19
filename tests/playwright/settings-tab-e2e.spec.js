import { test, expect, _electron as electron } from "@playwright/test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { spawn, spawnSync } from "node:child_process"

async function ensureElectronBuild() {
    try {
        await fs.stat(path.join(process.cwd(), "dist-electron", "main", "index.js"))
        await fs.stat(path.join(process.cwd(), "dist-electron", "preload", "index.js"))
        return
    } catch {
        // build below
    }
    await new Promise((resolve, reject) => {
        const child = spawn("npx", ["vite", "build"], { stdio: "inherit", env: { ...process.env } })
        child.on("error", reject)
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`vite build failed with exit code ${code}`)))
    })
}

async function launchApp(userDataDir) {
    const app = await electron.launch({
        args: ["--no-sandbox", "tests/playwright/electron-runner.cjs"],
        env: { ...process.env, HEYNOTE_TEST_USER_DATA_DIR: userDataDir },
    })
    const page = await app.firstWindow()
    await page.waitForLoadState("domcontentloaded")
    await expect(page.locator(".cm-editor")).toBeVisible()
    return { app, page }
}

async function closeElectronApp(electronApp) {
    if (!electronApp) return
    const childProcess = electronApp.process()
    const hasExited = () => !childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null
    const waitForExit = () => hasExited() ? Promise.resolve() : new Promise((resolve) => childProcess.once("exit", resolve))
    const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    await Promise.race([electronApp.close(), timeout(5000)])
    await Promise.race([waitForExit(), timeout(1000)])
    if (hasExited()) return
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(childProcess.pid), "/T", "/F"], { stdio: "ignore" })
    } else {
        childProcess.kill("SIGKILL")
    }
    await Promise.race([waitForExit(), timeout(5000)])
}

async function removeDirWithRetry(dirPath, retries = 10) {
    const retryable = new Set(["ENOTEMPTY", "EBUSY", "EPERM"])
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            await fs.rm(dirPath, { recursive: true, force: true })
            return
        } catch (err) {
            if (!retryable.has(err.code) || attempt === retries) throw err
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        }
    }
}

test.describe("settings tab e2e", { tag: "@e2e" }, () => {
    test.skip(({ browserName }) => browserName !== "chromium", "Electron runs only once under chromium")

    let electronApp
    let tmpRoot

    test.afterEach(async () => {
        await closeElectronApp(electronApp)
        electronApp = null
        if (tmpRoot) {
            await removeDirWithRetry(tmpRoot)
            tmpRoot = null
        }
    })

    test("Settings reopens on the last used tab, also after restarting the app", async () => {
        test.setTimeout(90000)
        await ensureElectronBuild()
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "heynote-e2e-settings-tab-"))
        const userDataDir = path.join(tmpRoot, "user-data")
        await fs.mkdir(userDataDir)

        let launched = await launchApp(userDataDir)
        electronApp = launched.app
        let page = launched.page

        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.settings .tab-content.tab-general")).toBeVisible()
        await page.locator("css=.overlay .settings .dialog .sidebar li.tab-keyboard-bindings").click()
        await expect(page.locator("css=.settings .tab-content.tab-keyboard-bindings")).toBeVisible()
        await page.locator("css=.overlay .settings .dialog .bottom-bar .close").click()
        await expect(page.locator("css=.overlay .settings .dialog")).not.toBeVisible()

        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.settings .tab-content.tab-keyboard-bindings")).toBeVisible()
        await expect(page.locator("css=.settings .tab-content.tab-general")).not.toBeVisible()

        const configPath = path.join(userDataDir, "config.json")
        await expect.poll(async () => {
            try {
                return JSON.parse(await fs.readFile(configPath, "utf-8")).settings?.settingsTab
            } catch {
                return undefined
            }
        }).toBe("keyboard-bindings")

        await closeElectronApp(electronApp)
        launched = await launchApp(userDataDir)
        electronApp = launched.app
        page = launched.page

        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.settings .tab-content.tab-keyboard-bindings")).toBeVisible()
        await expect(page.locator("css=.overlay .settings .dialog .sidebar li.tab-keyboard-bindings")).toHaveClass(/active/)
        await page.screenshot({ path: path.join("test-results", "settings-tab-after-restart.png") })
    })

    test("Settings falls back to the first tab when config.json has an unknown tab", async () => {
        test.setTimeout(60000)
        await ensureElectronBuild()
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "heynote-e2e-settings-tab-"))
        const userDataDir = path.join(tmpRoot, "user-data")
        await fs.mkdir(userDataDir)
        await fs.writeFile(path.join(userDataDir, "config.json"), JSON.stringify({ settings: { settingsTab: "no-such-tab" } }))

        let launched = await launchApp(userDataDir)
        electronApp = launched.app
        let page = launched.page

        await page.locator("css=.status-block.settings").click()
        await expect(page.locator("css=.settings .tab-content.tab-general")).toBeVisible()
        await expect(page.locator("css=.overlay .settings .dialog .sidebar li.tab-general")).toHaveClass(/active/)
    })
})
