"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Contrast, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SegmentedControl, type SegmentOption } from "./ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { SwitchField } from "./ui/switch";
import { ToastProvider } from "./ui/toast-provider";

export type ThemeChoice = "light" | "dark" | "high-contrast" | "high-contrast-dark";
export type TextSize = "small" | "default" | "large" | "extra-large";

interface AppearancePreferences {
  textSize: TextSize;
  reduceMotion: boolean;
  setTextSize: (value: TextSize) => void;
  setReduceMotion: (value: boolean) => void;
}

const AppearanceContext = createContext<AppearancePreferences | null>(null);
const TEXT_SIZE_KEY = "hale-text-size";
const MOTION_KEY = "hale-reduce-motion";

function preference(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function persistPreference(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch { /* The choice still applies for this visit. */ }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>("default");
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    const savedSize = preference(TEXT_SIZE_KEY);
    const savedMotion = preference(MOTION_KEY);
    const frame = requestAnimationFrame(() => {
      const initialSize: TextSize = savedSize && ["small", "default", "large", "extra-large"].includes(savedSize) ? savedSize as TextSize : "default";
      const initialMotion = savedMotion === null ? matchMedia("(prefers-reduced-motion: reduce)").matches : savedMotion === "true";
      setTextSizeState(initialSize);
      setReduceMotionState(initialMotion);
      document.documentElement.dataset.textSize = initialSize;
      document.documentElement.dataset.reduceMotion = initialMotion ? "reduce" : "full";
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const value = useMemo<AppearancePreferences>(() => ({
    textSize,
    reduceMotion,
    setTextSize(next) {
      setTextSizeState(next);
      persistPreference(TEXT_SIZE_KEY, next);
      document.documentElement.dataset.textSize = next;
    },
    setReduceMotion(next) {
      setReduceMotionState(next);
      persistPreference(MOTION_KEY, String(next));
      document.documentElement.dataset.reduceMotion = next ? "reduce" : "full";
    },
  }), [textSize, reduceMotion]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme storageKey="hale-theme" themes={["light", "dark", "high-contrast", "high-contrast-dark"]}>
    <AppearanceProvider><ToastProvider>{children}</ToastProvider></AppearanceProvider>
  </NextThemesProvider>;
}

export function useAppearancePreferences() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("AppearanceProvider is missing.");
  return value;
}

export function useReducedMotionPreference() {
  return useAppearancePreferences().reduceMotion;
}

const themeOptions: SegmentOption<string>[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "high-contrast", label: "High contrast", Icon: Contrast },
];
const contrastOptions: SegmentOption<"high-contrast" | "high-contrast-dark">[] = [
  { value: "high-contrast", label: "Light" },
  { value: "high-contrast-dark", label: "Dark" },
];
const sizeOptions: SegmentOption<TextSize>[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "extra-large", label: "Extra large" },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const selected = theme?.startsWith("high-contrast") ? "high-contrast" : theme === "system" ? resolvedTheme ?? "light" : theme ?? "light";
  const contrastTheme = theme === "high-contrast-dark" ? "high-contrast-dark" : "high-contrast";
  const choose = (value: string) => setTheme(value === "high-contrast" ? "high-contrast" : value);
  return <div className={`theme-controls${compact ? " theme-controls-compact" : ""}`}>
    <SegmentedControl ariaLabel="Color theme" value={selected} options={themeOptions} onValueChange={choose} className="theme-switcher" />
    {selected === "high-contrast" && <div className="high-contrast-scheme">
      <span>High contrast colors</span>
      <SegmentedControl ariaLabel="High contrast color scheme" value={contrastTheme} options={contrastOptions} onValueChange={setTheme} />
    </div>}
  </div>;
}

export function TextSizeControl() {
  const { textSize, setTextSize } = useAppearancePreferences();
  return <SegmentedControl ariaLabel="Text size" value={textSize} options={sizeOptions} onValueChange={setTextSize} className="text-size-switcher" />;
}

function AppearancePanel({ compact = false }: { compact?: boolean }) {
  const { reduceMotion, setReduceMotion } = useAppearancePreferences();
  return <div className={`appearance-controls${compact ? " appearance-controls-compact" : ""}`}>
    <section className="appearance-control-group"><h3>Color theme</h3><ThemeSwitcher compact={compact} /></section>
    <section className="appearance-control-group"><h3>Text size</h3><TextSizeControl /></section>
    <SwitchField id={compact ? "header-reduce-motion" : "settings-reduce-motion"} checked={reduceMotion} onCheckedChange={setReduceMotion} label="Reduce motion" className="reduce-motion-control" />
  </div>;
}

export function AppearanceMenu({ editorial = false, editorialFontClass = "" }: { editorial?: boolean; editorialFontClass?: string }) {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia("(max-width: 700px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const editorialClass = editorial ? " family-display-surface" : "";
  const trigger = <Button type="button" variant="ghost" size="md" className={`display-trigger${editorialClass}`}><Contrast aria-hidden className="size-6" /><span>Display</span></Button>;
  if (mobile) return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent side="bottom" className={`display-sheet${editorial ? " family-display-sheet" : ""} ${editorial ? editorialFontClass : ""}`}>
      <SheetHeader><SheetTitle>Display &amp; accessibility</SheetTitle><SheetDescription>Choose colors, text size, and motion preferences.</SheetDescription></SheetHeader>
      <AppearancePanel />
    </SheetContent>
  </Sheet>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent className={`display-popover${editorial ? " family-display-popover" : ""} ${editorial ? editorialFontClass : ""}`}><AppearancePanel compact /></PopoverContent>
  </Popover>;
}

export function AppearanceSettings() {
  const { textSize } = useAppearancePreferences();
  const selectedSize = sizeOptions.find((size) => size.value === textSize)?.label ?? "Default";
  return <Card className="appearance-settings">
    <CardHeader><CardTitle>Appearance &amp; accessibility</CardTitle><CardDescription>Adjust the colors and text size to make Hale easier to use.</CardDescription></CardHeader>
    <CardContent className="appearance-settings-content">
      <AppearancePanel />
      <p className="appearance-preview" aria-live="polite"><strong>Live preview · {selectedSize} text</strong><br />Hale helps keep care conversations and important details within reach.</p>
    </CardContent>
  </Card>;
}
