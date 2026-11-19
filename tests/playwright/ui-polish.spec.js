import { test, expect } from "@playwright/test"
import { HeynotePage } from "./test-utils.js"

let heynotePage

test.beforeEach(async ({ page }) => {
    heynotePage = new HeynotePage(page)
    await heynotePage.goto()
})

for (const theme of ["light", "dark"]) {
    test(`long buffer names keep Settings reachable in ${theme} narrow windows`, async ({ page }) => {
        await heynotePage.setSettings({ theme })
        const name = "Project roadmap release planning and follow-up"
        await page.locator("body").press(heynotePage.agnosticKey("Mod+N"))
        await page.locator('.new-buffer input[placeholder="Name"]').fill(name)
        await page.locator('.new-buffer button[type="submit"]').click()
        await expect(page.locator(".status .note")).toHaveText(name)
        for (const width of [632, 375]) {
            await page.setViewportSize({ width, height: 700 })
            const settings = page.getByRole("button", { name: "Settings", exact: true })
            const rect = await settings.boundingBox()
            expect(rect.x + rect.width).toBeLessThanOrEqual(width)
            await settings.focus()
            await page.keyboard.press("Enter")
            await expect(page.locator(".settings .dialog")).toBeVisible()
            await page.keyboard.press("Escape")
        }
    })
}

test("command search explains empty results and recovers to readable actions", async ({ page }) => {
    await heynotePage.executeCommand("openCommandPalette")
    const input = page.getByLabel("Command palette", { exact: true })
    await input.fill(">no-such-command-zzzz")
    await expect(page.getByRole("status")).toHaveText("No commands found. Try a different search.")
    await input.press("Enter")
    await expect(input).toBeVisible()
    // Raw command identifiers remain searchable, but aren't displayed as labels.
    await input.fill(">cursorLineUp")
    await expect(page.locator(".note-selector .selected .name")).toHaveText("Cursor: Move cursor one line up")
    await input.press("Escape")
    await expect(page.locator(".note-selector")).toHaveCount(0)
    await expect(page.locator(".cm-content")).toBeFocused()
    expect(heynotePage.getErrors()).toEqual([])
})

test("language search safely handles no results and stays within a small viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 500 })
    await page.locator(".status .lang").click()
    const input = page.getByLabel("Block language", { exact: true })
    const panel = await page.locator(".language-selector").boundingBox()
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(375)
    expect(panel.y + panel.height).toBeLessThanOrEqual(500)
    await input.fill("no-such-language-zzzz")
    await expect(page.getByRole("status")).toContainText("No languages found")
    await input.press("ArrowDown")
    await input.press("ArrowUp")
    await input.press("Enter")
    await expect(input).toBeVisible()
    await input.fill("cpp")
    await expect(page.locator(".language-selector .selected")).toHaveText("C++")
    await input.press("Enter")
    await expect(page.locator(".language-selector")).toHaveCount(0)
    await expect(page.locator(".status .lang")).toContainText("C++")
    expect(heynotePage.getErrors()).toEqual([])
})

test("filtering buffers clears stale edit actions and deletion confirmations", async ({ page }) => {
    for (const name of ["Disposable review", "Keep planning"]) {
        await page.locator("body").press(heynotePage.agnosticKey("Mod+N"))
        await page.locator('.new-buffer input[placeholder="Name"]').fill(name)
        await page.locator('.new-buffer button[type="submit"]').click()
        await expect(page.locator(".status .note")).toHaveText(name)
    }

    await heynotePage.executeCommand("openBufferSelector")
    const input = page.getByLabel("Switch buffer", { exact: true })
    await input.fill("Disposable review")
    await input.press("ArrowRight")
    await expect(page.locator(".note-selector .action-buttons button.selected")).toHaveText("Edit")
    await input.fill("Keep planning")
    await input.press("Enter")
    await expect(page.locator(".note-selector")).toHaveCount(0)
    await expect(page.locator(".new-buffer")).toHaveCount(0)
    await expect(page.locator(".status .note")).toHaveText("Keep planning")

    await heynotePage.executeCommand("openBufferSelector")
    await input.fill("Disposable review")
    await input.press("ArrowRight")
    await input.press("ArrowRight")
    await input.press("Enter")
    await expect(page.getByRole("button", { name: "Really Delete?", exact: true })).toBeVisible()
    await input.fill("Keep planning")
    await expect(page.getByRole("button", { name: "Really Delete?", exact: true })).toHaveCount(0)
    await input.press("ArrowRight")
    await input.press("ArrowRight")
    await expect(page.locator(".note-selector .action-buttons button.selected")).toHaveText("Delete")
    await input.press("Enter")
    await expect(page.getByRole("button", { name: "Really Delete?", exact: true })).toBeVisible()
    expect(Object.keys(await heynotePage.getStoredBufferList()).sort()).toEqual([
        "disposable-review.txt",
        "keep-planning.txt",
        "scratch.txt",
    ])
    expect(heynotePage.getErrors()).toEqual([])
})
