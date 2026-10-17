"use client";

import { Checkbox } from "./ui/checkbox";

export function AskProviderConsent({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="check-label ask-provider-consent"><Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} /><span>Use the OpenRouter free model for conversational answers. Relevant source excerpts will be sent to OpenRouter; this is optional. Without it, Hale answers locally from exact matching source text.</span></label>;
}
