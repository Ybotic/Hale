import { chromium } from "@playwright/test";

const routes = [
  ["patient-today", "/patient/today"],
  ["patient-memories", "/patient/memories"],
  ["patient-ask", "/patient/ask"],
  ["patient-care", "/patient/care"],
  ["patient-people", "/patient/people"],
  ["patient-settings", "/patient/settings"],
  ["patient-conversation", "/patient/conversations/garden-lunch"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const [name, route] of routes) {
  await page.goto(`http://localhost:3001${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 350) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/opencode/${name}.png`, fullPage: true });
}
await browser.close();
console.log("done");
