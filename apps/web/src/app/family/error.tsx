"use client";
import { Gate } from "@/components/providers";
import { Button } from "@/components/ui/button";
export default function FamilyError({ reset }: { reset: () => void }) {
  return <Gate title="This space isn’t available right now." description="Your access may have changed, or the connection was interrupted. No private data is shown in this view."><Button variant="primary" onClick={reset}>Try again</Button></Gate>;
}
