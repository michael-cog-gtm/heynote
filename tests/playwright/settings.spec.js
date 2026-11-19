import { test, expect } from "@playwright/test";
import { HeynotePage } from "./test-utils.js";

/** @type HeynotePage */
let heynotePage

test.beforeEach(async ({ page }) => {
    heynotePage = new HeynotePage(page)
});


test("test open settings dialog", async ({ page }) => {
    await heynotePage.goto()
    await page.locator("css=.status-block.settings").click()
    await expect(page.locator("css=.overlay .settings .dialog")).toBeVisible()
})

test("test close settings dialog", async ({ page }) => {
    await heynotePage.goto()
    await page.locator("css=.status-block.settings").click()
    await page.locator("css=.overlay .settings .dialog .bottom-bar .close").click()
    await expect(page.locator("css=.overlay .settings .dialog")).not.toBeVisible()
})

test("test close settings dialog with escape", async ({ page }) => {
    await heynotePage.goto()
    await page.locator("css=.status-block.settings").click()
    await page.locator("body").press("Escape")
    await expect(page.locator("css=.overlay .settings .dialog")).not.toBeVisible()
})

test("test change line gutter setting", async ({ page }) => {
    await heynotePage.goto()
    await expect(page.locator("css=.cm-lineNumbers")).toBeVisible()
    await page.locator("css=.status-block.settings").click()
    await page.locator("css=.overlay .settings .dialog .sidebar li.tab-appearance").click()
    await expect(page.locator("css=.settings .tab-content.tab-appearance")).toBeVisible()
    await page.getByLabel("Show line numbers").click()
    await expect(page.locator("css=.cm-lineNumbers")).toBeHidden()
    expect((await heynotePage.getStoredSettings()).showLineNumberGutter).toBe(false)
    await page.getByLabel("Show line numbers").click()
    await expect(page.locator("css=.cm-lineNumbers")).toBeVisible()
    expect((await heynotePage.getStoredSettings()).showLineNumberGutter).toBe(true)
})

test("test load editor without fold gutter", async({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem("settings", JSON.stringify({showFoldGutter:false}))
    })
    await heynotePage.goto()
    await page.locator("body").pressSequentially("hejsan")
    await expect.poll(async () => heynotePage.getBlockContent(0)).toBe("hejsan")
    await expect(page.locator(".cm-foldGutter")).toHaveCount(0)
})

test("settings dialog reopens on the last used tab", async ({ page }) => {
    await heynotePage.goto()
    await page.locator("css=.status-block.settings").click()
    await expect(page.locator("css=.settings .tab-content.tab-general")).toHaveClass(/active/)
    await page.locator("css=.overlay .settings .dialog .sidebar li.tab-appearance").click()
    await expect(page.locator("css=.settings .tab-content.tab-appearance")).toBeVisible()
    await page.locator("body").press("Escape")
    await expect(page.locator("css=.overlay .settings .dialog")).not.toBeVisible()

    await page.locator("css=.status-block.settings").click()
    await expect(page.locator("css=.settings .tab-content.tab-appearance")).toBeVisible()
    await expect(page.locator("css=.settings .tab-content.tab-general")).not.toHaveClass(/active/)
    await expect(page.locator("css=.overlay .settings .dialog .sidebar li.tab-appearance")).toHaveClass(/active/)
    expect((await heynotePage.getStoredSettings()).settingsTab).toBe("appearance")

    // changing a setting on the tab must not reset the remembered tab
    await page.getByLabel("Show line numbers").click()
    expect((await heynotePage.getStoredSettings()).settingsTab).toBe("appearance")
    await page.getByLabel("Show line numbers").click()

    await page.reload()
    await expect(page.locator(".cm-editor")).toBeVisible()
    await page.locator("css=.status-block.settings").click()
    await expect(page.locator("css=.settings .tab-content.tab-appearance")).toBeVisible()
})

test("settings dialog falls back to the first tab for an unknown stored tab", async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem("settings", JSON.stringify({settingsTab: "no-such-tab"}))
    })
    await heynotePage.goto()
    await page.locator("css=.status-block.settings").click()
    await expect(page.locator("css=.settings .tab-content.tab-general")).toHaveClass(/active/)
})
