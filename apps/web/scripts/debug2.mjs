import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3001/patient/memories", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const marked = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll(".timeline-memories > *, .memory-card, .conversation-row"));
  const row = rows.find((r) => r.getBoundingClientRect().top > 900);
  if (!row) return false;
  row.dataset.animProbe = "1";
  row.scrollIntoView({ block: "center" });
  return true;
});

if (marked) {
  const samples = [];
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(110);
    samples.push(await page.evaluate(() => {
      const row = document.querySelector('[data-anim-probe="1"]');
      if (!row) return "gone";
      const s = getComputedStyle(row);
      const ty = s.transform === "none" ? "0" : (s.transform.match(/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/)?.[1] ?? "?");
      return `op=${(+s.opacity).toFixed(2)} ty=${ty}`;
    }));
  }
  console.log(samples.join("\n"));
} else {
  console.log("no below-fold row found");
}
await browser.close();
