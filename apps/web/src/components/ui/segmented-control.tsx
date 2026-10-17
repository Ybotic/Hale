"use client";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  Icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onValueChange,
  className,
}: {
  ariaLabel: string;
  value: T;
  options: SegmentOption<T>[];
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return <ToggleGroup type="single" aria-label={ariaLabel} value={value} onValueChange={(next) => { if (next) onValueChange(next as T); }} className={className}>
    {options.map(({ value: option, label, Icon }) => <ToggleGroupItem key={option} value={option} aria-label={label} className="gap-2">
      {Icon && <Icon aria-hidden className="size-6" />}
      <span>{label}</span>
    </ToggleGroupItem>)}
  </ToggleGroup>;
}
