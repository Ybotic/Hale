"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { ChevronRight, Contrast, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SegmentedControl, type SegmentOption } from "./ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { SwitchField } from "./ui/switch";
import { ToastProvider } from "./ui/toast-provider";

export type ThemeChoice = "light" | "dark" | "high-contrast" | "high-contrast-dark";
export type TextSize = "small" | "default" | "large" | "extra-large";
export type ButtonSize = "normal" | "large" | "extra-large";

interface AppearancePreferences {
  textSize: TextSize;
  buttonSize: ButtonSize;
  reduceMotion: boolean;
  setTextSize: (value: TextSize) => void;
  setButtonSize: (value: ButtonSize) => void;
  setReduceMotion: (value: boolean) => void;
}

const AppearanceContext = createContext<AppearancePreferences | null>(null);
const TEXT_SIZE_KEY = "hale-text-size";
const BUTTON_SIZE_KEY = "hale-button-size";
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
  const [buttonSize, setButtonSizeState] = useState<ButtonSize>("normal");
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    const savedSize = preference(TEXT_SIZE_KEY);
    const savedButtonSize = preference(BUTTON_SIZE_KEY);
    const savedMotion = preference(MOTION_KEY);
    const frame = requestAnimationFrame(() => {
      const initialSize: TextSize = savedSize && ["small", "default", "large", "extra-large"].includes(savedSize) ? savedSize as TextSize : "default";
      const initialButtonSize: ButtonSize = savedButtonSize && ["normal", "large", "extra-large"].includes(savedButtonSize) ? savedButtonSize as ButtonSize : "normal";
      const initialMotion = savedMotion === null ? matchMedia("(prefers-reduced-motion: reduce)").matches : savedMotion === "true";
      setTextSizeState(initialSize);
      setButtonSizeState(initialButtonSize);
      setReduceMotionState(initialMotion);
      document.documentElement.dataset.textSize = initialSize;
      document.documentElement.dataset.buttonSize = initialButtonSize;
      document.documentElement.dataset.reduceMotion = initialMotion ? "reduce" : "full";
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const value = useMemo<AppearancePreferences>(() => ({
    textSize,
    buttonSize,
    reduceMotion,
    setTextSize(next) {
      setTextSizeState(next);
      persistPreference(TEXT_SIZE_KEY, next);
      document.documentElement.dataset.textSize = next;
    },
    setButtonSize(next) {
      setButtonSizeState(next);
      persistPreference(BUTTON_SIZE_KEY, next);
      document.documentElement.dataset.buttonSize = next;
    },
    setReduceMotion(next) {
      setReduceMotionState(next);
      persistPreference(MOTION_KEY, String(next));
      document.documentElement.dataset.reduceMotion = next ? "reduce" : "full";
    },
  }), [textSize, buttonSize, reduceMotion]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem enableColorScheme storageKey="hale-theme" themes={["light", "dark", "high-contrast", "high-contrast-dark"]} scriptProps={{ type: typeof window === "undefined" ? "text/javascript" : "text/plain" }}>
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
const buttonSizeOptions: SegmentOption<ButtonSize>[] = [
  { value: "normal", label: "Normal" },
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

function ButtonSizeControl() {
  const { buttonSize, setButtonSize } = useAppearancePreferences();
  return <SegmentedControl ariaLabel="Button size" value={buttonSize} options={buttonSizeOptions} onValueChange={setButtonSize} className="button-size-switcher" />;
}

function AppearancePanel({ compact = false, patient = false }: { compact?: boolean; patient?: boolean }) {
  const { reduceMotion, setReduceMotion } = useAppearancePreferences();
  return <div className={`appearance-controls${compact ? " appearance-controls-compact" : ""}`}>
    <section className="appearance-control-group"><h3>Color theme</h3><ThemeSwitcher compact={compact} /></section>
    <section className="appearance-control-group"><h3>Text size</h3><TextSizeControl /></section>
    {patient && <section className="appearance-control-group patient-button-size-setting"><h3>Button size</h3><ButtonSizeControl /></section>}
    <SwitchField id={compact ? "header-reduce-motion" : "settings-reduce-motion"} checked={reduceMotion} onCheckedChange={setReduceMotion} label="Reduce motion" className="reduce-motion-control" />
  </div>;
}

export function AppearanceMenu({ editorial = false, patient = false, editorialFontClass = "", patientFontClass = "" }: { editorial?: boolean; patient?: boolean; editorialFontClass?: string; patientFontClass?: string }) {
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
  const patientClass = patient ? " patient-display-tile" : "";
  const portalFontClass = editorial ? editorialFontClass : patient ? patientFontClass : "";
  const trigger = <Button type="button" variant="ghost" size="md" className={`display-trigger${editorialClass}${patientClass}`}>{patient ? <><span className="patient-icon-box"><Contrast aria-hidden /></span><span className="patient-tile-copy"><strong>Display</strong><span>Color, text &amp; motion</span></span><ChevronRight aria-hidden /></> : <><Contrast aria-hidden className="size-6" /><span>Display</span></>}</Button>;
  if (mobile) return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent side="bottom" className={`display-sheet${editorial ? " family-display-sheet" : ""}${patient ? " patient-display-sheet" : ""} ${portalFontClass}`}>
      <SheetHeader><SheetTitle>Display &amp; accessibility</SheetTitle><SheetDescription>{patient ? "Choose colors, text size, button size, and motion preferences." : "Choose colors, text size, and motion preferences."}</SheetDescription></SheetHeader>
      <AppearancePanel patient={patient} />
    </SheetContent>
  </Sheet>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent className={`display-popover${editorial ? " family-display-popover" : ""}${patient ? " patient-display-popover" : ""} ${portalFontClass}`}><AppearancePanel compact patient={patient} /></PopoverContent>
  </Popover>;
}

export function AppearanceSettings({ patient = false }: { patient?: boolean }) {
  const { textSize } = useAppearancePreferences();
  const selectedSize = sizeOptions.find((size) => size.value === textSize)?.label ?? "Default";
  return <Card className="appearance-settings">
    <CardHeader><CardTitle>Appearance &amp; accessibility</CardTitle><CardDescription>{patient ? "Adjust colors, text, button size, and motion to make Hale easier to use." : "Adjust the colors and text size to make Hale easier to use."}</CardDescription></CardHeader>
    <CardContent className="appearance-settings-content">
      <AppearancePanel patient={patient} />
    </CardContent>
  </Card>;
}
