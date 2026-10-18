import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3001/patient/memories", { waitUntil: "networkidle" });
await page.waitForTimeout(700);

const marked = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll(".timeline-memories > *, .memory-card, .conversation-row"));
  const row = rows.find((r) => r.getBoundingClientRect().top > 900);
  if (!row) return false;
  row.dataset.probe = "1";
  return true;
});
console.log("marked below-fold row:", marked);

// Human-like scroll: small steps, real timing
const samples = [];
for (let i = 0; i < 22; i++) {
  await page.evaluate(() => window.scrollBy(0, 180));
  await page.waitForTimeout(130);
  samples.push(await page.evaluate(() => {
    const row = document.querySelector('[data-probe="1"]');
    if (!row) return "gone";
    const top = Math.round(row.getBoundingClientRect().top);
    const s = getComputedStyle(row);
    return `top=${top} op=${(+s.opacity).toFixed(2)}`;
  }));
}
console.log(samples.join("\n"));
await browser.close();
