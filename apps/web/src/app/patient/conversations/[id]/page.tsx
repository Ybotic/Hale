import { ConversationDetail } from "@/components/conversation-detail";
export default async function PatientConversationPage({ params }: { params: Promise<{ id: string }> }) { return <ConversationDetail id={(await params).id} patient />; }
