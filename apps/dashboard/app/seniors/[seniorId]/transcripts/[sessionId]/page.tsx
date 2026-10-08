import { TranscriptReview } from "../../../../../src/components/TranscriptReview";

export default async function TranscriptPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <TranscriptReview sessionId={sessionId} />;
}
