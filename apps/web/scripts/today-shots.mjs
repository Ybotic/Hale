import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3001/patient/today", { waitUntil: "networkidle" });
await page.waitForTimeout(1400);
await page.screenshot({ path: "/tmp/opencode/today-top.png" });
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(900);
await page.screenshot({ path: "/tmp/opencode/today-mid.png" });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1100);
await page.screenshot({ path: "/tmp/opencode/today-end.png" });
await browser.close();
console.log("done");
