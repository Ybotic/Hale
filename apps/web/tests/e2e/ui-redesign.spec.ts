import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const localHosts = new Set(["127.0.0.1", "localhost"]);
let blockedRequests: string[] = [];

async function installOfflineGuards(context: BrowserContext, page: Page) {
  blockedRequests = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const blocked = !localHosts.has(url.hostname) || url.pathname.startsWith("/api/backend/");
    if (blocked) {
      blockedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await context.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    const writes: string[] = [];
    Object.defineProperty(window, "__haleStorageWrites", { value: writes, configurable: true });
    Storage.prototype.setItem = function (key: string, value: string) {
      writes.push(key);
      return originalSetItem.call(this, key, value);
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: () => Promise.resolve({}) },
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!localHosts.has(url.hostname) || url.pathname.startsWith("/api/backend/")) {
      blockedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
    }
  });
}

async function expectCleanPage(page: Page) {
  const documentState = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    storageWrites: (window as Window & { __haleStorageWrites?: string[] }).__haleStorageWrites ?? [],
    portalText: Array.from(document.querySelectorAll("nextjs-portal"))
      .map((portal) => portal.shadowRoot?.textContent ?? "")
      .join(" "),
  }));
  expect(documentState.width).toBeLessThanOrEqual(documentState.viewport + 1);
  expect(documentState.storageWrites).toEqual([]);
  expect(documentState.portalText).not.toMatch(/\b[1-9]\s+issues?\b/i);
  expect(blockedRequests).toEqual([]);
}

test.beforeEach(async ({ context, page }) => {
  await installOfflineGuards(context, page);
});

test("recording consent continues to gate the Start action", async ({ page }) => {
  await page.goto("/patient/today");
  const consent = page.getByRole("checkbox", { name: /everyone here agrees to recording/i });
  const start = page.getByRole("button", { name: /start a conversation/i });
  await expect(consent).not.toBeChecked();
  await expect(start).toBeDisabled();
  await consent.check();
  await expect(start).toBeEnabled();
  await expect(start).toHaveText(/start a conversation/i);
  await expectCleanPage(page);
});

test("conversation deletion remains confirmation-gated", async ({ page }) => {
  await page.goto("/family/conversations/garden-lunch");
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: /delete this conversation/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep conversation" }).click();
  await expect(dialog).toBeHidden();
  await expectCleanPage(page);
});

test("all contractual routes fit at each requested viewport/theme/text size", async ({ page }) => {
  const routes = [
    "/", "/login", "/signup", "/signup/patient", "/signup/voice", "/invite/accept",
    "/family", "/family/overview", "/family/calendar", "/family/conversations",
    "/family/conversations/garden-lunch", "/family/ask", "/family/care", "/family/people", "/family/settings",
    "/patient", "/patient/today", "/patient/ask", "/patient/memories",
    "/patient/conversations/garden-lunch", "/patient/care", "/patient/people", "/patient/settings",
  ];
  const themes = ["light", "dark", "high-contrast", "high-contrast-dark"];
  const sizes = ["small", "default", "large", "extra-large"];
  const widths = [360, 768, 1440];
  test.setTimeout(600_000);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 960 });
      for (const theme of themes) {
        for (const size of sizes) {
          await page.evaluate(([nextTheme, nextSize]) => {
            document.documentElement.dataset.theme = nextTheme;
            document.documentElement.dataset.textSize = nextSize;
          }, [theme, size]);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          expect(overflow, `${route} overflows at ${width}px in ${theme}/${size}`).toBe(false);
          const gradients = await page.evaluate(() => [".family-app", ".patient-app"].flatMap((selector) => {
            const element = document.querySelector(selector);
            return element && getComputedStyle(element).backgroundImage !== "none" ? [selector] : [];
          }));
          expect(gradients, `${route} has a container gradient in ${theme}/${size}`).toEqual([]);
        }
      }
    }
    await expectCleanPage(page);
  }
});

test("Ask Hale buttons and Overview action cards remain non-overlapping at narrow widths", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/patient/today");
  const sendGroup = page.locator(".voice-assistant-form");
  const controls = await sendGroup.locator("textarea, button").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width, height: box.height };
  }));
  for (let index = 1; index < controls.length; index++) {
    expect(controls[index].left).toBeGreaterThanOrEqual(controls[index - 1].right - 1);
  }
  expect(controls.every((control) => control.width >= 44 && control.height >= 44)).toBe(true);

  await page.goto("/family/overview");
  const cardOverlaps = await page.locator(".overview-actions > a").evaluateAll((cards) => cards.some((card) => {
    const text = card.querySelector("span");
    const arrow = card.querySelector("svg:last-child");
    if (!text || !arrow) return false;
    return text.getBoundingClientRect().right > arrow.getBoundingClientRect().left;
  }));
  expect(cardOverlaps).toBe(false);
  await expectCleanPage(page);
});

test("capture representative theme and breakpoint screenshots", async ({ page }) => {
  await mkdir(resolve(process.cwd(), "../../docs/ui-screenshots"), { recursive: true });
  const screenshots = [
    { route: "/family/overview", width: 1440, height: 1000, theme: "light", size: "default", name: "overview-light-1440.png" },
    { route: "/family/overview", width: 768, height: 960, theme: "dark", size: "default", name: "overview-dark-768.png" },
    { route: "/family/overview", width: 360, height: 900, theme: "high-contrast", size: "extra-large", name: "overview-high-contrast-360-xl.png" },
    { route: "/patient/today", width: 360, height: 900, theme: "light", size: "extra-large", name: "patient-today-light-360-xl.png" },
    { route: "/patient/ask", width: 768, height: 960, theme: "dark", size: "large", name: "patient-ask-dark-768-large.png" },
    { route: "/patient/care", width: 1440, height: 1000, theme: "high-contrast-dark", size: "default", name: "patient-care-high-contrast-dark-1440.png" },
  ];
  for (const shot of screenshots) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(shot.route);
    await page.evaluate(([theme, size]) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.textSize = size;
    }, [shot.theme, shot.size]);
    await page.screenshot({ path: resolve(process.cwd(), `../../docs/ui-screenshots/${shot.name}`), fullPage: true });
  }
  await expectCleanPage(page);
});
