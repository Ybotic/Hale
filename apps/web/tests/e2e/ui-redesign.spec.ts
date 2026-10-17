import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const localHosts = new Set(["127.0.0.1", "localhost"]);
let blockedRequests: string[] = [];
const consoleDiagnostics = new WeakMap<Page, string[]>();

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
  expect(consoleDiagnostics.get(page) ?? []).toEqual([]);
}

test.beforeEach(async ({ context, page }) => {
  consoleDiagnostics.set(page, []);
  page.on("console", (message) => {
    if (message.type() === "error") consoleDiagnostics.get(page)?.push(message.text());
  });
  page.on("pageerror", (error) => consoleDiagnostics.get(page)?.push(error.message));
  await installOfflineGuards(context, page);
});

test("family editorial routes fit at each theme, text size, and viewport with AA copy contrast", async ({ page }) => {
  const routes = [
    "/", "/login", "/signup", "/signup/patient", "/signup/voice", "/invite/accept",
    "/family", "/family/overview", "/family/calendar", "/family/conversations",
    "/family/conversations/garden-lunch", "/family/ask", "/family/care", "/family/people", "/family/settings",
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
      for (const [theme, size] of themes.flatMap((theme) => sizes.map((size) => [theme, size]))) {
        await page.evaluate(([nextTheme, nextSize]) => {
          document.documentElement.dataset.theme = nextTheme;
          document.documentElement.dataset.textSize = nextSize;
        }, [theme, size]);
        const pageState = await page.evaluate(() => {
          const app = document.querySelector<HTMLElement>(".family-app");
          const intro = app?.querySelector<HTMLElement>(".page-intro");
          const eyebrow = intro?.querySelector<HTMLElement>(".eyebrow");
          const copy = app?.querySelector<HTMLElement>(".intro-description, .recap-copy");
          const width = document.documentElement.scrollWidth;
          const viewport = window.innerWidth;
          const luminance = (color: string) => {
            const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
            const channels = color.startsWith("color(srgb") ? values.map((channel) => channel * 255) : values;
            const linear = channels.map((channel) => {
              const value = channel / 255;
              return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
            });
            return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
          };
          const contrast = (foreground: string, background: string) => {
            const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
            return (light + .05) / (dark + .05);
          };
          const background = app ? getComputedStyle(app).backgroundColor : "rgb(255, 255, 255)";
          const rect = (element: Element | null) => {
            if (!element) return null;
            const box = element.getBoundingClientRect();
            return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
          };
          const recap = app?.querySelector<HTMLElement>(".recap-layout");
          const overflowingElements = width <= viewport + 1 ? [] : Array.from(document.body.querySelectorAll("*"))
            .map((element) => {
              const box = element.getBoundingClientRect();
              return { tag: element.tagName, className: typeof element.className === "string" ? element.className : "", right: Math.round(box.right), text: element.textContent?.trim().slice(0, 40) ?? "" };
            })
            .filter((element) => element.right > viewport + 1)
            .slice(0, 8);
          return {
            width,
            viewport,
            layout: {
              app: rect(app),
              main: rect(app?.querySelector(".family-main") ?? null),
              recap: rect(recap ?? null),
              recapColumns: recap ? getComputedStyle(recap).gridTemplateColumns : "",
              glance: rect(recap?.querySelector(".day-at-a-glance") ?? null),
            },
            overflowingElements,
            serif: intro ? getComputedStyle(intro.querySelector("h1")!).fontFamily : "",
            eyebrowColor: eyebrow ? getComputedStyle(eyebrow).color : "",
            bodyColor: copy ? getComputedStyle(copy).color : "",
            backgroundColor: background,
            eyebrowRatio: eyebrow ? contrast(getComputedStyle(eyebrow).color, background) : null,
            bodyRatio: copy ? contrast(getComputedStyle(copy).color, background) : null,
          };
        });
        expect(pageState.width, `${route} overflows at ${width}px in ${theme}/${size}: ${JSON.stringify(pageState.layout)} ${JSON.stringify(pageState.overflowingElements)}`).toBeLessThanOrEqual(pageState.viewport + 1);
        if (route === "/family/overview") {
          expect(pageState.serif.toLowerCase()).toContain("newsreader");
          expect(pageState.eyebrowRatio, `${theme}/${size} eyebrow contrast`).toBeGreaterThanOrEqual(4.5);
          expect(pageState.bodyRatio, `${theme}/${size} body contrast`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    await expectCleanPage(page);
  }
});

test("family Ctrl-wheel floats content but leaves native zoom available with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/family/overview");
  await page.getByRole("button", { name: "Display" }).click();
  await expect(page.getByRole("heading", { name: "Color theme" })).toBeVisible();
  const themeControls = page.getByRole("radiogroup", { name: "Color theme" });
  for (const label of ["Light", "Dark", "High contrast"]) await expect(themeControls.getByRole("radio", { name: label, exact: true })).toBeVisible();
  const sizeControls = page.getByRole("radiogroup", { name: "Text size" });
  for (const label of ["Small", "Default", "Large", "Extra large"]) await expect(sizeControls.getByRole("radio", { name: label, exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeVisible();
  for (const theme of ["light", "dark", "high-contrast", "high-contrast-dark"]) {
    for (const size of ["small", "default", "large", "extra-large"]) {
      await page.evaluate(([nextTheme, nextSize]) => {
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.dataset.textSize = nextSize;
      }, [theme, size]);
      const menuBox = await page.locator(".family-display-popover").evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      expect(menuBox.left).toBeGreaterThanOrEqual(0);
      expect(menuBox.right).toBeLessThanOrEqual(menuBox.viewportWidth);
      expect(menuBox.bottom).toBeLessThanOrEqual(menuBox.viewportHeight);
    }
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.textSize = "default";
  });
  await page.keyboard.press("Escape");
  const active = await page.evaluate(async () => {
    const root = document.querySelector<HTMLElement>(".family-app");
    const heading = root?.querySelector<HTMLElement>(".page-intro h1");
    if (!root || !heading) return { prevented: false, transform: "" };
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 80 });
    root.dispatchEvent(event);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      prevented: event.defaultPrevented,
      transform: heading.style.transform,
      ctrlKey: event.ctrlKey,
      mediaReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      setting: document.documentElement.dataset.reduceMotion,
    };
  });
  expect(active.prevented, JSON.stringify(active)).toBe(true);
  expect(active.transform).toContain("translate3d");
  await expect.poll(() => page.locator(".family-app .page-intro h1").evaluate((element) => (element as HTMLElement).style.transform)).toBe("");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".family-app");
    if (!root) return true;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 80 });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(reduced).toBe(false);
  await expectCleanPage(page);
});

test("capture family editorial screenshots across palettes and breakpoints", async ({ page }) => {
  await mkdir(resolve(process.cwd(), "../../docs/ui-screenshots"), { recursive: true });
  const screenshots = [
    { route: "/family/overview", width: 1440, height: 1000, theme: "light", size: "default", name: "family-editorial-overview-light-1440.png" },
    { route: "/family/ask", width: 768, height: 960, theme: "dark", size: "large", name: "family-editorial-ask-dark-768-large.png" },
    { route: "/family/calendar", width: 360, height: 960, theme: "high-contrast", size: "extra-large", name: "family-editorial-calendar-hc-360-xl.png" },
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

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/family/overview");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.getByRole("button", { name: "Display" }).click();
  await page.screenshot({ path: resolve(process.cwd(), "../../docs/ui-screenshots/family-editorial-display-light-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/family/overview");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "high-contrast";
    document.documentElement.dataset.textSize = "extra-large";
  });
  await page.getByRole("button", { name: "Display" }).click();
  await page.screenshot({ path: resolve(process.cwd(), "../../docs/ui-screenshots/family-editorial-display-hc-360-xl.png"), fullPage: true });
  await expectCleanPage(page);
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

test("demo sign-in explains local mode and links to fictional workspaces", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Demo mode is ready." })).toBeVisible();
  await expect(page.getByText(/no account is created and no live patient data is used/i)).toBeVisible();

  await page.getByRole("link", { name: "Open family demo" }).click();
  await expect(page).toHaveURL(/\/family\/overview$/);
  await expect(page.getByText(/fictional people, synthetic memories/i)).toBeVisible();
  await expectCleanPage(page);

  await page.goto("/login");
  await page.getByRole("link", { name: "Open patient demo" }).click();
  await expect(page).toHaveURL(/\/patient\/today$/);
  await expect(page.getByText(/fictional memories/i).first()).toBeVisible();
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
          const overflowingElements = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 ? [] :
            Array.from(document.body.querySelectorAll("*"))
              .map((element) => {
                const box = element.getBoundingClientRect();
                return { tag: element.tagName, className: typeof element.className === "string" ? element.className : "", right: Math.round(box.right), width: Math.round(box.width), text: element.textContent?.trim().slice(0, 48) ?? "" };
              })
              .filter((element) => element.right > window.innerWidth + 1)
              .slice(0, 8),
          );
          expect(overflowingElements, `${route} overflows at ${width}px in ${theme}/${size}`).toEqual([]);
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
  await page.evaluate(() => { document.documentElement.dataset.textSize = "extra-large"; });
  const patientNavLabels = await page.locator(".patient-bottom-nav > a > span, .patient-bottom-nav .patient-bottom-more > span").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, width: element.clientWidth, scrollWidth: element.scrollWidth })));
  expect(patientNavLabels.every((label) => label.scrollWidth <= label.width), JSON.stringify(patientNavLabels)).toBe(true);
  const sendGroup = page.locator(".voice-assistant-form");
  const controls = await sendGroup.locator("textarea, button").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  }));
  const controlsOverlap = controls.some((control, index) => controls.slice(index + 1).some((other) =>
    control.left < other.right - 1 && control.right > other.left + 1 && control.top < other.bottom - 1 && control.bottom > other.top + 1,
  ));
  expect(controlsOverlap).toBe(false);
  expect(controls.every((control) => control.width >= 44 && control.height >= 44), JSON.stringify(controls)).toBe(true);

  await page.goto("/family/overview");
  await page.evaluate(() => { document.documentElement.dataset.textSize = "extra-large"; });
  const familyNavLabels = await page.locator(".family-bottom-nav > a > span, .family-bottom-nav .family-more-sheet > span").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, width: element.clientWidth, scrollWidth: element.scrollWidth })));
  expect(familyNavLabels.every((label) => label.scrollWidth <= label.width), JSON.stringify(familyNavLabels)).toBe(true);
  const cardTextOverflows = await page.locator(".overview-actions > a").evaluateAll((cards) => cards.some((card) => {
    const cardBox = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll("strong, span span")).some((text) => {
      const textBox = text.getBoundingClientRect();
      return textBox.left < cardBox.left || textBox.right > cardBox.right;
    });
  }));
  expect(cardTextOverflows).toBe(false);
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
