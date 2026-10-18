export interface CitedWeeklyText {
  text: string;
  turnIds: string[];
}

export interface CitedWeeklyHighlight extends CitedWeeklyText {
  title: string;
}

export interface WeeklyAiSummary {
  overview: CitedWeeklyText;
  highlights: CitedWeeklyHighlight[];
  plans: CitedWeeklyText[];
}

const diagnosisLanguage = /\b(amnesia|dementia|alzheimer(?:'s)?|cognitive (?:decline|impairment)|memory loss|symptom|diagnos\w*)\b/i;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function citedText(value: unknown, allowedTurnIds: ReadonlySet<string>): CitedWeeklyText | undefined {
  const item = object(value);
  const text = typeof item?.text === "string" ? item.text.trim().slice(0, 900) : "";
  const ids = Array.isArray(item?.turnIds) ? item.turnIds.filter((id): id is string => typeof id === "string") : [];
  if (!text || diagnosisLanguage.test(text) || !ids.length || ids.some((id) => !allowedTurnIds.has(id))) return undefined;
  return { text, turnIds: [...new Set(ids)] };
}

export function parseWeeklyAiSummary(value: string, allowedTurnIds: ReadonlySet<string>): WeeklyAiSummary | undefined {
  const json = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let root: Record<string, unknown> | undefined;
  try { root = object(JSON.parse(json)); }
  catch { return undefined; }
  if (!root) return undefined;
  const overview = citedText(root.overview, allowedTurnIds);
  if (!overview) return undefined;
  const highlights = Array.isArray(root.highlights) ? root.highlights.flatMap((value): CitedWeeklyHighlight[] => {
    const item = object(value);
    const cited = citedText(item, allowedTurnIds);
    const title = typeof item?.title === "string" ? item.title.trim().slice(0, 100) : "";
    return cited && title && !diagnosisLanguage.test(title) ? [{ ...cited, title }] : [];
  }).slice(0, 8) : [];
  const plans = Array.isArray(root.plans) ? root.plans.flatMap((value): CitedWeeklyText[] => {
    const item = citedText(value, allowedTurnIds);
    return item && !diagnosisLanguage.test(item.text) ? [item] : [];
  }).slice(0, 8) : [];
  return { overview, highlights, plans };
}
