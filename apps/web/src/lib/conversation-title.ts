const GREETING_ONLY = /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|how are you|how's it going)[,!?.\s]*$/i;

function titleFromSentence(sentence: string): string | undefined {
  const cleaned = sentence
    .replace(/^[\s"'“”‘’([{]+|[\s"'“”‘’)}\].,!?:;]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length < 3 || GREETING_ONLY.test(cleaned)) return undefined;
  const title = words.length > 9 ? `${words.slice(0, 8).join(" ")}…` : cleaned;
  return title[0].toLocaleUpperCase() + title.slice(1);
}

export function conversationTitleFromTranscript(text: string): string | undefined {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  const sentences = normalized.match(/[^.!?]+[.!?]?/gu) ?? [normalized];
  for (const sentence of sentences) {
    const title = titleFromSentence(sentence);
    if (title) return title;
  }
  return undefined;
}

export function conversationTitleFromTurns(turns: readonly { text: string }[]): string | undefined {
  for (const turn of turns) {
    const title = conversationTitleFromTranscript(turn.text);
    if (title) return title;
  }
  return undefined;
}
