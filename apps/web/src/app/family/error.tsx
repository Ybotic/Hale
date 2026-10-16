"use client";
import { Gate } from "@/components/providers";
export default function FamilyError({ reset }: { reset: () => void }) {
  return <Gate title="This space isn’t available right now." description="Your access may have changed, or the connection was interrupted. No private data is shown in this view."><button className="btn btn-primary" onClick={reset}>Try again</button></Gate>;
}
