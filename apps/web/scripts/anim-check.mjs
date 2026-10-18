import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

async function probe(url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => {
    const el = document.querySelector(".page-scroll-reveal > *:nth-child(2)") || document.querySelector(".patient-reveal-list > *");
    return el ? getComputedStyle(el).opacity : "no-el";
  });
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
  });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const el = document.querySelector(".page-scroll-reveal > *:nth-child(2)") || document.querySelector(".patient-reveal-list > *");
    return el ? getComputedStyle(el).opacity : "no-el";
  });
  console.log(url, "| before scroll:", before, "| after scroll:", after);
}

await probe("http://localhost:3000/patient/memories");
await probe("http://localhost:3000/patient/care");
await probe("http://localhost:3000/patient/today");
await browser.close();
