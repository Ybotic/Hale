import "server-only";

type ChatRole = "system" | "user" | "assistant";
export type OpenRouterContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type OpenRouterMessage = { role: ChatRole; content: string | OpenRouterContentPart[] };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_FREE_CHAT_MODEL = "liquid/lfm-2.5-2.6b:free";

export function selectedFreeChatModel() {
  const configured = process.env.OPENROUTER_CHAT_MODEL;
  return configured?.endsWith(":free") ? configured : DEFAULT_FREE_CHAT_MODEL;
}

function messageText(content: unknown) {
  if (typeof content === "string") return content.trim().slice(0, 4000) || null;
  if (Array.isArray(content)) {
    const text = content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("");
    return text.trim().slice(0, 4000) || null;
  }
  if (content && typeof content === "object" && "text" in content && typeof content.text === "string") {
    return content.text.trim().slice(0, 4000) || null;
  }
  return null;
}

export async function completeWithOpenRouter(input: {
  messages: OpenRouterMessage[];
  maxTokens?: number;
  model?: string;
  fetcher?: Fetcher;
}): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const fetcher = input.fetcher ?? fetch;
    const initialMaxTokens = input.maxTokens ?? 500;
    const retryMaxTokens = Math.max(initialMaxTokens, 1024);
    for (const maxTokens of initialMaxTokens < retryMaxTokens ? [initialMaxTokens, retryMaxTokens] : [initialMaxTokens]) {
      const response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_ORIGIN ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
          "X-Title": "Hale",
        },
        body: JSON.stringify({ model: input.model?.endsWith(":free") ? input.model : selectedFreeChatModel(), messages: input.messages, max_tokens: maxTokens, temperature: 0.2 }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      if (!response.ok) return null;
      const payload = await response.json() as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> };
      const choice = payload.choices?.[0];
      const content = messageText(choice?.message?.content);
      if (choice?.finish_reason === "length" && maxTokens < retryMaxTokens) continue;
      if (content) return content;
      return null;
    }
  } catch { /* The caller keeps a deterministic, source-grounded response available. */ }
  return null;
}
