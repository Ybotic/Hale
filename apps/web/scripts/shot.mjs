import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3001/patient/today", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
// scroll to bottom progressively so GSAP reveals fire
await page.evaluate(async () => {
  for (let y = 0; y <= document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/opencode/patient-today-scrolled.png", fullPage: true });

const family = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await family.goto("http://localhost:3001/family/overview", { waitUntil: "networkidle" });
await family.waitForTimeout(1500);
await family.evaluate(async () => {
  for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
});
await family.waitForTimeout(1200);
await family.screenshot({ path: "/tmp/opencode/family-overview.png", fullPage: true });
await browser.close();
console.log("done");
