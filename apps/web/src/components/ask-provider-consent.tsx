"use client";

import { SwitchField } from "./ui/switch";

export function AskProviderConsent({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="ask-provider-consent">
    <SwitchField
      id="ask-online-answers"
      className="online-consent-switch"
      checked={checked}
      onCheckedChange={onChange}
      label="Allow online answers"
      description="Relevant saved-conversation excerpts may be shared with an online service to compose a reply. Turn this off to use directly matched source text."
    />
  </div>;
}
