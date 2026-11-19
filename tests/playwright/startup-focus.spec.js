import { test, expect } from "@playwright/test"
import { HeynotePage } from "./test-utils.js"

for (const showLeftPanel of [true, false]) {
    test(`editor has focus on open and reload with sidebar ${showLeftPanel}`, async ({ page }) => {
        await page.addInitScript(({ showLeftPanel }) => {
            localStorage.setItem("settings", JSON.stringify({ showLeftPanel }))
        }, { showLeftPanel })
        const heynotePage = new HeynotePage(page)
        await heynotePage.goto()
        await expect(page.locator(".cm-content")).toBeFocused()
        await page.keyboard.type("Ready to type")
        await expect.poll(() => heynotePage.getBlockContent(0)).toBe("Ready to type")
        await heynotePage.waitForContentSaved()

        await page.reload()
        await expect(page.locator(".cm-content")).toBeFocused()
        await expect.poll(() => heynotePage.getBlockContent(0)).toBe("Ready to type")

        const scroller = page.locator(".tab-bar .scroller")
        await scroller.focus()
        await expect(scroller).toBeFocused()
        await page.keyboard.press("Tab")
        await expect(page.locator(".cm-content")).toBeFocused()
        expect(heynotePage.getErrors()).toEqual([])
    })
}
