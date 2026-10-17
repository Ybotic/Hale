"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { Card, Drawer, SegmentedControl } from "./ui-primitives";

export type ThemeChoice = "light" | "dark" | "high-contrast";
export type TextSize = "small" | "default" | "large" | "extra-large";

interface Appearance {
  theme: ThemeChoice;
  textSize: TextSize;
  reduceMotion: boolean;
  setTheme: (value: ThemeChoice) => void;
  setTextSize: (value: TextSize) => void;
  setReduceMotion: (value: boolean) => void;
}

const AppearanceContext = createContext<Appearance | null>(null);
const THEME_KEY = "hale-theme";
const TEXT_SIZE_KEY = "hale-text-size";
const MOTION_KEY = "hale-reduce-motion";

function readPreference(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch { /* Keep the appearance change available for this visit. */ }
}

function syncThemeColor() {
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--ground").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

function systemTheme(): ThemeChoice {
  if (window.matchMedia("(prefers-contrast: more)").matches) return "high-contrast";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyAppearance(theme: ThemeChoice, textSize: TextSize, reduceMotion: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.dataset.textSize = textSize;
  root.dataset.reduceMotion = reduceMotion ? "reduce" : "full";
  syncThemeColor();
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("light");
  const [textSize, setTextSizeState] = useState<TextSize>("default");
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    const storedTheme = readPreference(THEME_KEY) as ThemeChoice | null;
    const storedSize = readPreference(TEXT_SIZE_KEY) as TextSize | null;
    const storedMotion = readPreference(MOTION_KEY);
    const initialize = () => {
      const nextTheme = storedTheme && ["light", "dark", "high-contrast"].includes(storedTheme) ? storedTheme : systemTheme();
      const nextSize = storedSize && ["small", "default", "large", "extra-large"].includes(storedSize) ? storedSize : "default";
      const nextMotion = storedMotion === null ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : storedMotion === "true";
      setThemeState(nextTheme);
      setTextSizeState(nextSize);
      setReduceMotionState(nextMotion);
      applyAppearance(nextTheme, nextSize, nextMotion);
    };
    const initializeFrame = window.requestAnimationFrame(initialize);

    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const contrast = window.matchMedia("(prefers-contrast: more)");
    const followSystem = () => {
      document.documentElement.dataset.colorScheme = colorScheme.matches ? "dark" : "light";
      if (!readPreference(THEME_KEY)) {
        const value = systemTheme();
        setThemeState(value);
        document.documentElement.dataset.theme = value;
      }
      if (storedMotion === null) {
        const value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setReduceMotionState(value);
        document.documentElement.dataset.reduceMotion = value ? "reduce" : "full";
      }
      syncThemeColor();
    };
    colorScheme.addEventListener("change", followSystem);
    contrast.addEventListener("change", followSystem);
    return () => {
      window.cancelAnimationFrame(initializeFrame);
      colorScheme.removeEventListener("change", followSystem);
      contrast.removeEventListener("change", followSystem);
    };
  }, []);

  const value = useMemo<Appearance>(() => ({
    theme,
    textSize,
    reduceMotion,
    setTheme(next) {
      setThemeState(next);
      writePreference(THEME_KEY, next);
      applyAppearance(next, textSize, reduceMotion);
    },
    setTextSize(next) {
      setTextSizeState(next);
      writePreference(TEXT_SIZE_KEY, next);
      applyAppearance(theme, next, reduceMotion);
    },
    setReduceMotion(next) {
      setReduceMotionState(next);
      writePreference(MOTION_KEY, String(next));
      applyAppearance(theme, textSize, next);
    },
  }), [theme, textSize, reduceMotion]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("AppearanceProvider is missing.");
  return value;
}

const themes: Array<{ id: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "high-contrast", label: "High contrast", Icon: Contrast },
];
const sizes: Array<{ id: TextSize; label: string }> = [
  { id: "small", label: "Small" },
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
  { id: "extra-large", label: "Extra large" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useAppearance();
  return <SegmentedControl label="Color theme" value={theme} onChange={setTheme} className="theme-switcher" options={themes.map(({ id, label, Icon }) => ({ value: id, label, Icon }))} />;
}

export function TextSizeControl() {
  const { textSize, setTextSize } = useAppearance();
  return <SegmentedControl label="Text size" value={textSize} onChange={setTextSize} className="text-size-switcher" options={sizes.map(({ id, label }) => ({ value: id, label }))} />;
}

export function AppearanceMenu() {
  return <Drawer className="appearance-menu" summary={<><Contrast aria-hidden size={24} /><span>Display</span></>}><div className="appearance-menu-panel"><AppearanceControls compact /></div></Drawer>;
}

export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const { reduceMotion, setReduceMotion } = useAppearance();
  return <div className={`appearance-controls${compact ? " appearance-controls-compact" : ""}`}>
    <div><h3>Color theme</h3><ThemeSwitcher /></div>
    <div><h3>Text size</h3><TextSizeControl /></div>
    <label className="reduce-motion-control"><input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} /><span>Reduce motion</span></label>
  </div>;
}

export function AppearanceSettings() {
  const { textSize } = useAppearance();
  return <Card as="section" className="appearance-settings" aria-labelledby="appearance-settings-title">
    <div className="appearance-settings-heading"><Contrast aria-hidden size={26} /><div><h2 id="appearance-settings-title">Appearance &amp; accessibility</h2><p>Adjust the colors and text size to make Hale easier to use.</p></div></div>
    <AppearanceControls />
    <p className="appearance-preview" aria-live="polite"><strong>Live preview · {sizes.find((size) => size.id === textSize)?.label} text</strong><br />Hale helps keep care conversations and important details within reach.</p>
  </Card>;
}
