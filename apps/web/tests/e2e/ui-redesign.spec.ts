import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
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

async function setScreenshotAppearance(page: Page, theme: string, size: string) {
  await page.waitForFunction(() => document.documentElement.dataset.textSize === "default" && document.documentElement.dataset.buttonSize === "normal");
  await page.evaluate(([nextTheme, nextSize]) => {
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.textSize = nextSize;
  }, [theme, size]);
  await page.evaluate(() => document.fonts.ready.then(() => true));
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
    "/", "/login", "/signup", "/signup/patient", "/signup/voice", "/invite/accept", "/terms",
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
          const copy = app?.querySelector<HTMLElement>(".intro-description, .recap-copy, .page-intro ~ nav ~ div p");
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

test("family and patient signup require agreement to the Terms of Service", async ({ page }) => {
  for (const { route, id } of [
    { route: "/signup", id: "family-terms-acceptance" },
    { route: "/signup/patient", id: "patient-terms-acceptance" },
  ]) {
    await page.goto(route);
    const acceptance = page.getByRole("checkbox", { name: "I have read and agree to Hale’s Terms of Service." });
    await expect(acceptance).toHaveAttribute("id", id);
    await expect(acceptance).not.toBeChecked();
    await expect(page.getByRole("link", { name: "Open family demo" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Read the Terms of Service" })).toHaveAttribute("href", "/terms");

    await acceptance.check();
    await expect(page.getByRole("link", { name: "Open family demo" })).toBeVisible();
    await acceptance.uncheck();
    await expect(page.getByRole("link", { name: "Open family demo" })).toHaveCount(0);
    await expectCleanPage(page);
  }

  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What Hale does—and does not do" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Patient sign up" })).toHaveAttribute("href", "/signup/patient");
  await expectCleanPage(page);
});

test("weekly medication days use toggle buttons without dashboard checkboxes", async ({ page }) => {
  for (const route of ["/family/care", "/patient/care"]) {
    await page.goto(route);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("tab", { name: "Medication records" }).click();
    await page.getByRole("button", { name: "Add a medication record" }).click();
    await page.locator('select[name="recurrence"]').selectOption("weekly");

    const days = page.getByRole("toolbar", { name: "Reminder days" });
    await expect(days.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    await days.getByRole("button", { name: "Sun" }).click();
    await expect(days.getByRole("button", { name: "Sun" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expectCleanPage(page);
  }
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
    await setScreenshotAppearance(page, shot.theme, shot.size);
    await page.screenshot({ path: resolve(process.cwd(), `../../docs/ui-screenshots/${shot.name}`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/family/overview");
  await setScreenshotAppearance(page, "light", "default");
  await page.getByRole("button", { name: "Display" }).click();
  await page.screenshot({ path: resolve(process.cwd(), "../../docs/ui-screenshots/family-editorial-display-light-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/family/overview");
  await setScreenshotAppearance(page, "high-contrast", "extra-large");
  await page.getByRole("button", { name: "Display" }).click();
  await page.screenshot({ path: resolve(process.cwd(), "../../docs/ui-screenshots/family-editorial-display-hc-360-xl.png"), fullPage: true });
  await expectCleanPage(page);
});

test("patient Today keeps recording first and moves the care assistant to Ask", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/patient/today");
  await expect(page.getByText("Today is Thursday, October 15")).toBeVisible();
  await expect(page.getByText("Margaret Okafor").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Good to see you, Margaret\./ })).toBeVisible();
  await expect(page.locator(".patient-header-context > span")).toHaveText("Margaret Okafor");
  await expect(page.locator(".patient-header-context > strong")).toHaveCount(0);
  await expect(page.locator(".patient-greeting h1 span")).toHaveCSS("font-style", "normal");

  const memoriesAction = page.locator(".patient-quick-grid .patient-memories-action");
  await expect(memoriesAction).toHaveAttribute("href", "/patient/memories");
  const memoriesStyle = await memoriesAction.evaluate((element) => ({
    bottomBorder: getComputedStyle(element).borderBottomWidth,
    shadow: getComputedStyle(element).boxShadow,
  }));
  expect(memoriesStyle.bottomBorder).toBe("3px");
  expect(memoriesStyle.shadow).not.toBe("none");

  const start = page.getByRole("button", { name: /start a conversation/i });
  await expect(page.getByRole("switch", { name: /everyone agrees to recording/i })).toHaveCount(0);
  await expect(start).toBeEnabled();
  expect((await start.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(64);

  await expect(page.getByRole("region", { name: "Ask Hale" })).toHaveCount(0);
  for (const label of ["Ask about your care", "Memories", "Conversations", "Rides, appointments & medication"]) {
    await expect(page.getByRole("link", { name: new RegExp(label, "i") }).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /something you did/i }).first()).toBeVisible();
  await expect(page.getByText("From a recorded conversation").first()).toBeVisible();

  await start.scrollIntoViewIfNeeded();
  await page.getByRole("link", { name: "Ask about your care" }).click();
  await expect(page).toHaveURL(/\/patient\/ask$/);
  await expect(page.getByRole("region", { name: "Ask Hale" })).toBeVisible();
  await expect(page.getByText(/fictional demo responses stay on this device/i)).toBeVisible();
  await expectCleanPage(page);
});

test("patient shell keeps Back, boxed tabs, and safe-area viewport on nested routes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const routes = [
    { route: "/patient/ask", back: "/patient/today" },
    { route: "/patient/memories", back: "/patient/today" },
    { route: "/patient/conversations/garden-lunch", back: "/patient/memories" },
    { route: "/patient/care", back: "/patient/today" },
    { route: "/patient/people", back: "/patient/today" },
    { route: "/patient/settings", back: "/patient/today" },
  ];
  for (const { route, back } of routes) {
    await page.goto(route);
    const backLink = page.getByRole("link", { name: "Back" });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", back);
    await expect(page.getByRole("navigation", { name: "Patient navigation" })).toBeVisible();
    await expect(page.locator(".patient-bottom-nav > a")).toHaveCount(3);
    const shell = await page.evaluate(() => ({
      viewportMeta: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ?? "",
      navHeight: document.querySelector(".patient-bottom-nav")?.getBoundingClientRect().height ?? 0,
      headerTopPadding: Number.parseFloat(getComputedStyle(document.querySelector(".patient-header")!).paddingTop),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    expect(shell.viewportMeta).toContain("viewport-fit=cover");
    expect(shell.navHeight).toBeGreaterThanOrEqual(64);
    expect(shell.headerTopPadding).toBeGreaterThanOrEqual(12);
    expect(shell.horizontalOverflow).toBe(false);
    await expectCleanPage(page);
  }
});

test("patient Button size setting persists and scales the patient interface", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/patient/today");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Display" }).click();
  const sizes = page.getByRole("radiogroup", { name: "Button size" });
  await expect(sizes.getByRole("radio", { name: "Normal", exact: true })).toBeVisible();
  await sizes.getByRole("radio", { name: "Extra large", exact: true }).click();
  const stored = await page.evaluate(() => ({
    buttonSize: localStorage.getItem("hale-button-size"),
    dataSize: document.documentElement.dataset.buttonSize,
    writes: (window as Window & { __haleStorageWrites?: string[] }).__haleStorageWrites ?? [],
  }));
  expect(stored.buttonSize).toBe("extra-large");
  expect(stored.dataSize).toBe("extra-large");
  expect(stored.writes).toEqual(["hale-button-size"]);
  expect(blockedRequests).toEqual([]);
  expect(consoleDiagnostics.get(page) ?? []).toEqual([]);
});

test("patient standalone More screen includes Display, Family website, and Install Hale tiles", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query !== "(display-mode: standalone)") return original(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return false; },
      } as MediaQueryList;
    }) as typeof window.matchMedia;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/patient/today");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Display/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Family website/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /People/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Settings/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install Hale" })).toHaveCount(0);
  await expectCleanPage(page);
});

test("patient Ask is one simple chat with a voice control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/patient/ask");
  const chat = page.getByRole("region", { name: "Ask Hale" });
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("heading", { name: "What would you like to remember?" })).toBeVisible();
  await expect(chat.locator("textarea")).toHaveCount(1);
  await expect(chat.getByRole("button", { name: "Send message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Record a voice message" })).toBeVisible();
  await expect(page.locator(".ask-page")).toHaveCount(0);
  await expectCleanPage(page);
});

test("patient PWA Settings shows voice profile and installation guidance", async ({ page }) => {
  await page.goto("/patient/settings");
  await expect(page.getByRole("heading", { name: "Family voice profiles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hale on your iPhone" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to Today" })).toHaveAttribute("href", "/patient/today");
  await expectCleanPage(page);
});

test("family Conversations downloads the seeded demo PDF above search", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 960 });
  await page.goto("/family/conversations");
  const summary = page.locator(".weekly-summary-card");
  const search = page.getByRole("searchbox", { name: "Search conversations" });
  await expect(summary).toBeVisible();
  await expect(search).toBeVisible();
  const positions = await page.evaluate(() => ({
    reportTop: document.querySelector(".weekly-summary-card")!.getBoundingClientRect().top,
    searchTop: document.querySelector('input[type="search"]')!.getBoundingClientRect().top,
  }));
  expect(positions.reportTop).toBeLessThan(positions.searchTop);

  const sampleLink = summary.getByRole("link", { name: "Download PDF" });
  await expect(sampleLink).toHaveAttribute("href", "/demo-weekly-summary.pdf");
  const downloadPromise = page.waitForEvent("download");
  await sampleLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hale-weekly-summary-demo.pdf");
  const path = resolve(process.cwd(), "test-results/weekly-summary-preview.pdf");
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expectCleanPage(page);
});

test("patient rides open Uber directly and Family Care has no Rides tab", async ({ page }) => {
  await page.goto("/patient/care");
  await expect(page.getByRole("link", { name: "Open Uber" })).toHaveAttribute("href", "https://m.uber.com/ul/");
  await expect(page.getByText(/live fare estimates|access token|server token/i)).toHaveCount(0);

  await page.goto("/family/care");
  await expect(page.getByRole("tab", { name: "Rides" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Appointments" })).toBeVisible();
  await expectCleanPage(page);
});

test("demo Care & Tasks is seeded locally and keeps the account balance private from patients", async ({ page }) => {
  await page.goto("/family/care");
  await page.getByRole("tab", { name: "Care costs" }).click();
  await expect(page.getByText("Okafor Family Checking")).toBeVisible();
  await expect(page.getByText("$2,438.17")).toBeVisible();
  await expect(page.getByText("Prescription copay")).toBeVisible();
  await expect(page.getByText(/Nessie is unavailable/i)).toHaveCount(0);

  await page.goto("/patient/care#costs");
  await expect(page.getByText("Shared demo expenses")).toBeVisible();
  await expect(page.getByText("Okafor Family Checking")).toHaveCount(0);
  await expect(page.getByText("Prescription copay")).toBeVisible();
  await expectCleanPage(page);
});

test("recording starts without the removed per-session prompt", async ({ page }) => {
  await page.goto("/patient/today");
  const start = page.getByRole("button", { name: /start a conversation/i });
  await expect(page.getByRole("switch", { name: /everyone agrees to recording/i })).toHaveCount(0);
  await expect(start).toBeEnabled();
  await expect(start).toHaveText(/start a conversation/i);
  await expectCleanPage(page);
});

test("demo sign-in explains local mode and links to fictional workspaces", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Demo account is ready." })).toBeVisible();
  await expect(page.getByText(/seeded fictional conversations, memories, appointments, medication notes, and care costs/i)).toBeVisible();

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
    "/", "/login", "/signup", "/signup/patient", "/signup/voice", "/invite/accept", "/terms",
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
  await page.waitForFunction(() => document.documentElement.dataset.textSize === "default" && document.documentElement.dataset.buttonSize === "normal");
  await page.evaluate(() => { document.documentElement.dataset.textSize = "extra-large"; });
  const patientNavLabels = await page.locator(".patient-bottom-nav > a > span, .patient-bottom-nav .patient-bottom-more > span").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, width: element.clientWidth, scrollWidth: element.scrollWidth, whiteSpace: getComputedStyle(element).whiteSpace })));
  expect(patientNavLabels.every((label) => label.scrollWidth <= label.width), JSON.stringify(patientNavLabels)).toBe(true);
  expect(patientNavLabels.every((label) => label.whiteSpace === "nowrap"), JSON.stringify(patientNavLabels)).toBe(true);
  const navCenters = await page.locator(".patient-bottom-nav > a, .patient-bottom-nav > button").evaluateAll((items) => items.map((item) => {
    const icon = item.querySelector("svg")!.getBoundingClientRect();
    const label = item.querySelector("span")!.getBoundingClientRect();
    return Math.abs((icon.left + icon.width / 2) - (label.left + label.width / 2));
  }));
  expect(navCenters.every((delta) => delta <= 1), JSON.stringify(navCenters)).toBe(true);

  const quickActions = page.locator(".patient-quick-grid");
  for (const width of [360, 390, 430, 520, 600, 700, 701]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await quickActions.evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
      titlesFit: Array.from(element.querySelectorAll<HTMLElement>(".patient-tile-copy strong")).every((title) => title.scrollWidth <= title.clientWidth),
    }));
    expect(layout.columns, `${width}px quick-action columns`).toBe(width <= 700 ? 1 : 2);
    expect(layout.titlesFit, `${width}px quick-action title overflow`).toBe(true);
  }

  await page.goto("/patient/ask");
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
    await setScreenshotAppearance(page, shot.theme, shot.size);
    await page.screenshot({ path: resolve(process.cwd(), `../../docs/ui-screenshots/${shot.name}`), fullPage: true });
  }
  await expectCleanPage(page);
});
