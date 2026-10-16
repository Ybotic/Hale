import { ConversationDetail } from "@/components/conversation-detail";
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  return <ConversationDetail id={(await params).id} />;
}
