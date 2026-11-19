import { test, expect } from "@playwright/test"
import { HeynotePage } from "./test-utils.js"

async function expectTheme(page, theme) {
    await expect(page.locator("html")).toHaveAttribute("theme", theme)
    await expect(page.locator(".cm-editor")).toHaveClass(new RegExp(`${theme}-theme`))
    await expect(page.locator(".tab-bar")).toHaveCSS("background-color",
        theme === "dark" ? "rgb(27, 28, 29)" : "rgb(235, 235, 235)")
}

test("System resolves to dark after selecting Light and survives reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await new HeynotePage(page).goto()
    await expectTheme(page, "dark")
    await page.locator(".status-block.settings").click()
    await page.locator(".tab-appearance").first().click()
    await page.locator("select.theme").selectOption("light")
    await expectTheme(page, "light")
    await page.locator("select.theme").selectOption("system")
    await expectTheme(page, "dark")
    await expect(page.locator("select.theme")).toHaveValue("system")
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system")
    await page.reload()
    await expectTheme(page, "dark")
    await page.emulateMedia({ colorScheme: "light" })
    await expectTheme(page, "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await expectTheme(page, "dark")
})

for (const theme of ["dark", "light"]) {
    test(`palette selects ${theme} and ignores OS changes`, async ({ page }) => {
        const heynote = new HeynotePage(page)
        await heynote.goto()
        await page.locator(".cm-content").click()
        await page.keyboard.press(heynote.agnosticKey("Mod+Shift+P"))
        await page.locator(".note-selector input").fill(`> ${theme}`)
        await page.getByText(`Color Theme: ${theme === "dark" ? "Dark" : "Light"}`, { exact: true }).click()
        await expectTheme(page, theme)
        await page.emulateMedia({ colorScheme: "dark" })
        await expectTheme(page, theme)
        await page.emulateMedia({ colorScheme: "light" })
        await expectTheme(page, theme)
        await page.reload()
        await expectTheme(page, theme)
        await page.locator(".cm-content").click()
        await page.keyboard.press(heynote.agnosticKey("Mod+Shift+P"))
        await page.locator(".note-selector input").fill("> system")
        await page.getByText("Color Theme: System", { exact: true }).click()
        await expectTheme(page, "light")
        expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system")
    })
}
