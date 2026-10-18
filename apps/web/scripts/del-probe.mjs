import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => { if (["error"].includes(m.type())) errors.push("console: " + m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
await page.goto("http://localhost:3001/family/conversations/garden-lunch", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Delete" }).click();
await page.waitForTimeout(800);
const state = await page.evaluate(() => ({
  dialogCount: document.querySelectorAll('[role="dialog"]').length,
  dialogHTML: document.querySelector('[role="dialog"]')?.textContent?.slice(0, 80) ?? null,
}));
console.log(JSON.stringify(state));
console.log(errors.slice(0, 8).join("\n") || "no errors");
await browser.close();
