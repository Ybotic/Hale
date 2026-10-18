import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Conversation, PatientSpace } from "@hale/contracts";
import { clockLabel, dateLabel, localDate, shiftDate } from "@hale/contracts/time";
import type { WeeklyAiSummary } from "./weekly-summary-policy";

export type RepeatedQuestionPhrase = {
  phrase: string;
  occurrences: number;
  sources: Array<{ title: string; date: string }>;
};

export type WeeklyConversationReport = Pick<PatientSpace, "name" | "timezone" | "people" | "conversations" | "memories"> & {
  fromDay: string;
  throughDay: string;
  limited: boolean;
  demo?: boolean;
  aiSummary: WeeklyAiSummary;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 46;
const contentWidth = pageWidth - margin * 2;
const colors = {
  ink: rgb(.12, .18, .14),
  muted: rgb(.38, .45, .4),
  green: rgb(.16, .38, .25),
  greenMid: rgb(.38, .62, .45),
  paleGreen: rgb(.92, .96, .92),
  paleGreen2: rgb(.97, .985, .97),
  line: rgb(.82, .88, .83),
  white: rgb(1, 1, 1),
};

function pdfSafeText(value: string, font: PDFFont) {
  let output = "";
  for (const character of value.normalize("NFC")) {
    const normalized = character
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...");
    for (const part of normalized) {
      try {
        font.encodeText(part);
        output += part;
      } catch {
        output += " ";
      }
    }
  }
  return output.replace(/\s+/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function questionKey(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function findRepeatedQuestionPhrases(conversations: readonly Conversation[], timezone: string): RepeatedQuestionPhrase[] {
  const phrases = new Map<string, { phrase: string; occurrences: number; sources: Map<string, { title: string; date: string }> }>();
  for (const conversation of conversations) {
    const date = localDate(conversation.startedAt, timezone);
    for (const turn of conversation.turns) {
      const phrase = turn.text.trim();
      const normalized = questionKey(phrase);
      const words = normalized.split(" ").filter(Boolean);
      const questionLike = /[?？]\s*$/.test(phrase) || /^(where|what|when|who|why|how|did|do|does|is|are|can|could|would)\b/i.test(normalized);
      if (!questionLike || words.length < 3 || normalized.length < 12) continue;
      const item = phrases.get(normalized) ?? { phrase, occurrences: 0, sources: new Map() };
      item.occurrences += 1;
      item.sources.set(conversation.id, { title: conversation.title, date });
      phrases.set(normalized, item);
    }
  }
  return [...phrases.values()]
    .filter((item) => item.occurrences > 1)
    .sort((a, b) => b.occurrences - a.occurrences || a.phrase.localeCompare(b.phrase))
    .slice(0, 6)
    .map((item) => ({ ...item, sources: [...item.sources.values()].sort((a, b) => a.date.localeCompare(b.date)) }));
}

export function buildDemoWeeklyAiSummary(space: Pick<PatientSpace, "conversations" | "memories">): WeeklyAiSummary {
  const turns = space.conversations.flatMap((conversation) => conversation.turns);
  const turnIds = turns.slice(0, 4).map((turn) => turn.id);
  const highlights = space.memories.slice(0, 6).flatMap((memory) => memory.turnIds.length
    ? [{ title: memory.title, text: memory.text, turnIds: memory.turnIds }]
    : [],
  );
  const plans = space.memories.filter((memory) => memory.kind === "plan" && memory.turnIds.length).slice(0, 6).map((memory) => ({ text: memory.text, turnIds: memory.turnIds }));
  return {
    overview: {
      text: `This fictional week includes ${space.conversations.length} conversations and ${space.memories.length} saved highlights. The excerpts below show the topics and plans represented in the available records.`,
      turnIds: turnIds.length ? turnIds : highlights[0]?.turnIds ?? [],
    },
    highlights,
    plans,
  };
}

export async function buildWeeklyConversationPdf(report: WeeklyConversationReport) {
  const conversations = report.conversations.filter((conversation) => {
    const day = localDate(conversation.startedAt, report.timezone);
    return day >= report.fromDay && day <= report.throughDay;
  }).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(report.fromDay, index));
  const conversationsByDay = new Map(days.map((day) => [day, conversations.filter((conversation) => localDate(conversation.startedAt, report.timezone) === day)]));
  const transcriptTurns = conversations.reduce((count, conversation) => count + conversation.turns.length, 0);
  const daysWithTranscripts = days.filter((day) => (conversationsByDay.get(day) ?? []).some((conversation) => conversation.turns.length > 0)).length;
  const repeatedQuestions = findRepeatedQuestionPhrases(conversations, report.timezone);
  const peopleById = new Map(report.people.map((person) => [person.id, person.name]));

  const document = await PDFDocument.create();
  document.setTitle(`Weekly conversation summary - ${report.fromDay} to ${report.throughDay}`);
  document.setAuthor("Hale");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawParagraph = (text: string, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; lineHeight?: number; gapAfter?: number } = {}) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const x = options.x ?? margin;
    const width = options.width ?? contentWidth;
    const lineHeight = options.lineHeight ?? size * 1.42;
    const safe = pdfSafeText(text, font);
    const lines = wrapText(safe, font, size, width);
    for (const line of lines) {
      if (y - lineHeight < margin + 28) addPage();
      page.drawText(line, { x, y: y - size, size, font, color: options.color ?? colors.ink });
      y -= lineHeight;
    }
    y -= options.gapAfter ?? 0;
  };

  const addPage = () => {
    page = document.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    page.drawText("hale.  /  WEEKLY CONVERSATION SUMMARY", { x: margin, y, size: 9, font: bold, color: colors.green });
    y -= 22;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: .8, color: colors.line });
    y -= 24;
  };

  const drawSection = (title: string) => {
    if (y < margin + 68) addPage();
    y -= 4;
    page.drawText(pdfSafeText(title, bold), { x: margin, y: y - 15, size: 13, font: bold, color: colors.green });
    y -= 24;
  };

  page.drawRectangle({ x: 0, y: pageHeight - 160, width: pageWidth, height: 160, color: colors.paleGreen });
  page.drawText("hale.", { x: margin, y: pageHeight - 63, size: 20, font: bold, color: colors.green });
  page.drawText("WEEKLY CONVERSATION SUMMARY", { x: margin, y: pageHeight - 101, size: 9, font: bold, color: colors.muted });
  page.drawText(pdfSafeText(report.name, bold), { x: margin, y: pageHeight - 129, size: 12, font: bold, color: colors.ink });
  y = pageHeight - 194;
  drawParagraph("Conversation highlights from the past seven days", { font: bold, size: 22, color: colors.ink, lineHeight: 28 });
  drawParagraph(`${dateLabel(report.fromDay, { weekday: undefined })} - ${dateLabel(report.throughDay, { weekday: undefined })}`, { size: 10, color: colors.muted, gapAfter: 8 });
  drawParagraph(report.demo
    ? "Synthetic demo summary from fictional transcripts. It does not assess a medical condition."
    : "AI-generated from available transcript text. It does not assess a medical condition.", { size: 9, color: colors.muted, gapAfter: 16 });

  const metricGap = 10;
  const metricWidth = (contentWidth - metricGap * 2) / 3;
  const metrics = [
    { value: String(conversations.length), label: "conversations" },
    { value: String(daysWithTranscripts), label: "days with transcripts" },
    { value: String(transcriptTurns), label: "transcript turns" },
  ];
  const metricY = y - 52;
  metrics.forEach((metric, index) => {
    const x = margin + index * (metricWidth + metricGap);
    page.drawRectangle({ x, y: metricY, width: metricWidth, height: 48, color: colors.paleGreen2, borderColor: colors.line, borderWidth: .7 });
    page.drawText(metric.value, { x: x + 11, y: metricY + 25, size: 15, font: bold, color: colors.green });
    page.drawText(pdfSafeText(metric.label, regular), { x: x + 11, y: metricY + 10, size: 8, font: regular, color: colors.muted });
  });
  y = metricY - 24;

  drawSection("Conversation activity by day");
  const chartHeight = 108;
  if (y - chartHeight < margin + 28) addPage();
  const chartY = y - chartHeight;
  page.drawRectangle({ x: margin, y: chartY, width: contentWidth, height: chartHeight, color: colors.paleGreen2, borderColor: colors.line, borderWidth: .7 });
  const chartLeft = margin + 18;
  const chartWidth = contentWidth - 36;
  const slotWidth = chartWidth / 7;
  const baseY = chartY + 30;
  const maxBarHeight = 48;
  const maxDailyCount = Math.max(1, ...days.map((day) => (conversationsByDay.get(day) ?? []).length));
  days.forEach((day, index) => {
    const count = (conversationsByDay.get(day) ?? []).length;
    const barWidth = Math.min(32, slotWidth * .48);
    const barHeight = count ? Math.max(4, maxBarHeight * count / maxDailyCount) : 2;
    const x = chartLeft + index * slotWidth + (slotWidth - barWidth) / 2;
    page.drawRectangle({ x, y: baseY, width: barWidth, height: barHeight, color: count ? colors.greenMid : colors.line });
    const countText = String(count);
    page.drawText(countText, { x: chartLeft + index * slotWidth + (slotWidth - regular.widthOfTextAtSize(countText, 8)) / 2, y: baseY + barHeight + 4, size: 8, font: regular, color: colors.muted });
    const label = dateLabel(day, { weekday: "short", month: "numeric", day: "numeric" });
    page.drawText(pdfSafeText(label, regular), { x: chartLeft + index * slotWidth + (slotWidth - regular.widthOfTextAtSize(pdfSafeText(label, regular), 7)) / 2, y: chartY + 12, size: 7, font: regular, color: colors.muted });
  });
  y = chartY - 24;

  const turnSources = new Map<string, { title: string; date: string }>();
  for (const conversation of conversations) {
    const date = localDate(conversation.startedAt, report.timezone);
    for (const turn of conversation.turns) turnSources.set(turn.id, { title: conversation.title, date });
  }
  const sourceLine = (turnIds: string[]) => {
    const sources = [...new Map(turnIds.flatMap((id) => {
      const source = turnSources.get(id);
      return source ? [[`${source.date}:${source.title}`, `${dateLabel(source.date, { weekday: "short", month: "short", day: "numeric" })} · ${source.title}`] as const] : [];
    })).values()];
    if (sources.length) drawParagraph(`Sources: ${sources.join("; ")}`, { size: 7.5, color: colors.muted, x: margin + 10, width: contentWidth - 10, gapAfter: 8 });
  };

  drawSection("Weekly summary");
  drawParagraph(report.aiSummary.overview.text, { size: 10, color: colors.ink, gapAfter: 3 });
  sourceLine(report.aiSummary.overview.turnIds);

  drawSection("Repeated question wording");
  drawParagraph("Exact question wording that appears more than once is listed with its source conversations for review. A repeated phrase alone does not explain why it occurred.", { size: 9, color: colors.muted, gapAfter: 4 });
  if (repeatedQuestions.length) {
    for (const item of repeatedQuestions) {
      drawParagraph(`“${item.phrase}”`, { font: bold, size: 10, gapAfter: 2 });
      drawParagraph(`Appears ${item.occurrences} times · ${item.sources.map((source) => `${dateLabel(source.date, { weekday: undefined })}: ${source.title}`).join("; ")}`, { size: 8, color: colors.muted, gapAfter: 8 });
    }
  } else {
    drawParagraph("No exact repeated question wording was found across the included transcript turns.", { size: 9, color: colors.muted, gapAfter: 8 });
  }

  if (report.aiSummary.highlights.length) {
    drawSection("Highlights");
    for (const highlight of report.aiSummary.highlights) {
      if (y < 126) addPage();
      drawParagraph(highlight.title, { font: bold, size: 10, color: colors.green, gapAfter: 2 });
      drawParagraph(highlight.text, { size: 9, color: colors.ink, gapAfter: 2 });
      sourceLine(highlight.turnIds);
    }
  }

  if (report.aiSummary.plans.length) {
    drawSection("Plans mentioned");
    for (const plan of report.aiSummary.plans) {
      if (y < 112) addPage();
      drawParagraph(plan.text, { size: 9, color: colors.ink, gapAfter: 2 });
      sourceLine(plan.turnIds);
    }
  }

  drawSection("Conversation excerpts");
  const withTurns = conversations.filter((conversation) => conversation.turns.length > 0);
  if (!withTurns.length) {
    drawParagraph("There are no transcript turns available for this date range yet.", { size: 9, color: colors.muted });
  }
  for (const conversation of withTurns) {
    const day = localDate(conversation.startedAt, report.timezone);
    drawParagraph(`${dateLabel(day, { weekday: "short", month: "short", day: "numeric" })}  /  ${conversation.title}`, { font: bold, size: 10, color: colors.green, gapAfter: 2 });
    const excerpts = conversation.turns.slice(0, 2);
    for (const turn of excerpts) {
      const speaker = turn.personId ? peopleById.get(turn.personId) ?? "Identified speaker" : turn.uncertain ? "Unidentified speaker" : "Speaker";
      const clock = clockLabel(new Date(new Date(conversation.startedAt).getTime() + turn.start * 1000).toISOString(), report.timezone);
      drawParagraph(`${speaker} · ${clock}: “${turn.text.slice(0, 260)}${turn.text.length > 260 ? "…" : ""}”`, { size: 8.5, color: colors.ink, x: margin + 10, width: contentWidth - 10, gapAfter: 3 });
    }
    y -= 7;
  }

  if (report.limited) {
    drawParagraph("This report reached the available transcript limit. Some conversations may not be included.", { size: 8, color: colors.muted, gapAfter: 6 });
  }
  for (const [index, reportPage] of document.getPages().entries()) {
    reportPage.drawLine({ start: { x: margin, y: 34 }, end: { x: pageWidth - margin, y: 34 }, thickness: .6, color: colors.line });
    reportPage.drawText("Transcript-based summary · Review the original conversation for context", { x: margin, y: 20, size: 7, font: regular, color: colors.muted });
    const pageLabel = `Page ${index + 1} of ${document.getPageCount()}`;
    reportPage.drawText(pageLabel, { x: pageWidth - margin - regular.widthOfTextAtSize(pageLabel, 7), y: 20, size: 7, font: regular, color: colors.muted });
  }
  return await document.save();
}
