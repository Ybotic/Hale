import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") errors.push(msg.type() + ": " + msg.text()); });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
await page.goto("http://localhost:3000/patient/today", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const opacity = await page.evaluate(() => {
  const screen = document.querySelector(".patient-today-screen");
  const greeting = document.querySelector(".patient-greeting");
  const main = document.querySelector(".patient-main");
  const tiles = document.querySelectorAll(".patient-box-tile");
  return {
    screenExists: !!screen,
    greetingOpacity: greeting ? getComputedStyle(greeting).opacity : null,
    mainHTML: main ? main.children.length : null,
    tileCount: tiles.length,
    firstTileOpacity: tiles[0] ? getComputedStyle(tiles[0]).opacity : null,
    screenChildren: screen ? Array.from(screen.children).map((c) => c.tagName + ":" + getComputedStyle(c).opacity) : [],
  };
});
console.log(JSON.stringify(opacity, null, 2));
console.log("ERRORS:", errors.slice(0, 10));
await browser.close();
