"use client";
import { useEffect } from "react";
import { Gate } from "@/components/providers";
import { useRecordingController } from "@/components/recorder";
import { Button } from "@/components/ui/button";
export default function PatientError({ reset }: { reset: () => void }) {
  const capture = useRecordingController();
  useEffect(() => { void capture?.interrupt("A page error interrupted recording. Check your connection, then tap Resume."); }, [capture]);
  return <Gate title="Let’s try that again." description="Your connection or access may have changed. Recording has been interrupted in this view."><Button variant="primary" onClick={reset}>Try again</Button></Gate>;
}
