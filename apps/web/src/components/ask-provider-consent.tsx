"use client";

export function AskProviderConsent({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="check-label ask-provider-consent"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>Use the OpenRouter free model for conversational answers. Relevant source excerpts will be sent to OpenRouter; this is optional. Without it, Hale answers locally from exact matching source text.</span></label>;
}
