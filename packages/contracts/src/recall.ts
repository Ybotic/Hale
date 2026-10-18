import type { CareRecord, CareRecordCitation, CareRecordType, Citation, PatientSpace, RecallAnswer } from "./index";
import { clockLabel, dateLabel, localDate, resolveDayQuestion, shiftDate } from "./time";

const stopwords = new Set("a an the did do i we you my me our what who when where how much about with was were is it of to for have has had tell said say talked talk discuss discussed yesterday today tomorrow last week last month last year on in and please records record care task tasks reminder reminders remind schedule scheduled next upcoming due details information entry entries show list me are was were the my have is up follow".split(" "));
const careQueryWords = new Set("appointment appointments doctor clinic provider checkup visit calendar medication medications medicine meds pill pills prescription dose dosing ride rides uber pickup dropoff transport cost costs price paid payment expense expenses receipt copay copayment bill bills amount care tasks reminders reminder schedule scheduled record records".split(" "));
const careCostQueryWords = new Set("cost costs price paid payment expense expenses receipt copay copayment bill bills amount spend spent spending".split(" "));
const careRecordTypes: CareRecordType[] = ["ride", "appointment", "medication", "care_cost"];

export function isCareRecordCitation(citation: RecallAnswer["citations"][number]): citation is CareRecordCitation {
  return (citation as CareRecordCitation).sourceType === "care_record";
}

function requestedCareTypes(question: string): CareRecordType[] {
  const types: CareRecordType[] = [];
  if (/\b(appointment|doctor|dentist|dentistry|optometrist|therapist|therapy|specialist|surgeon|nurse|clinic|provider|check.?up|follow.?up|visit|calendar)\b/i.test(question)) types.push("appointment");
  const costQuestion = /\b(cost|costs|price|paid|payment|expense|expenses|receipt|copay|copayment|bill|bills|amount|spend|spent|spending)\b/i.test(question);
  const medicationQuestion = /\b(medication|medications|medicine|meds|pill|pills|prescription|dose|dosing)\b/i.test(question);
  const medicationDetails = /\b(dose|dosing|instructions|directions|schedule|reminder)\b/i.test(question);
  if (medicationQuestion && (!costQuestion || medicationDetails)) types.push("medication");
  if (costQuestion) types.push("care_cost");
  if (/\b(uber|ride|rides|pickup|drop.?off|transport)\b/i.test(question)) types.push("ride");
  return types;
}

function careRecordIntent(question: string, types: CareRecordType[]) {
  return types.length > 0 || /\b(care\s*(?:&|and)\s*tasks|care records?|my reminders?|remind me|my schedule|scheduled tasks?)\b/i.test(question);
}

export function isCareRecordQuestion(question: string) {
  return careRecordIntent(question, requestedCareTypes(question));
}

function careRecordDate(record: CareRecord) {
  return record.localDate ?? (record.scheduledAt === null ? undefined : localDate(record.scheduledAt, record.timezone));
}

function careDateRange(question: string, today: string) {
  if (/\blast week\b/i.test(question)) return { from: shiftDate(today, -7), through: shiftDate(today, -1) };
  if (/\bnext week\b/i.test(question)) return { from: shiftDate(today, 1), through: shiftDate(today, 7) };
  if (/\blast month\b/i.test(question)) {
    const currentMonthStart = `${today.slice(0, 7)}-01`;
    const through = shiftDate(currentMonthStart, -1);
    return { from: `${through.slice(0, 7)}-01`, through };
  }
  if (/\blast year\b/i.test(question)) {
    const year = Number(today.slice(0, 4)) - 1;
    return { from: `${year}-01-01`, through: `${year}-12-31` };
  }
  return undefined;
}

function reminderDayNames(days: number[]) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days.filter((day) => Number.isInteger(day) && day >= 0 && day < 7).sort((a, b) => a - b).map((day) => names[day]).join(", ");
}

function moneyLabel(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function careRecordExcerpt(record: CareRecord) {
  const date = careRecordDate(record);
  const appointmentTime = record.scheduledAt === null ? "" : clockLabel(new Date(record.scheduledAt).toISOString(), record.timezone);
  const when = date ? `${dateLabel(date)}${record.type === "appointment" || record.type === "ride" ? ` at ${appointmentTime}` : ""} (${record.timezone})` : "date not recorded";
  const details = record.details.trim() ? `Recorded details: “${record.details.trim()}”.` : "No additional details were recorded.";
  if (record.type === "medication") {
    const frequency = record.recurrence === "none" ? "record only" : record.recurrence === "as_needed" ? "as needed" : record.recurrence;
    const days = record.recurrence === "weekly" && record.reminderDays.length ? ` on ${reminderDayNames(record.reminderDays)}` : "";
    const times = record.reminderTimes.length ? ` at ${record.reminderTimes.join(", ")} (${record.timezone})` : "";
    const reminders = record.remindersEnabled ? "Hale reminders are enabled." : "Hale reminders are not enabled.";
    return `Medication record: ${record.title}. ${details} Recorded schedule: ${frequency}${days}${times}. Start date: ${when}. No end date or active-status confirmation is recorded. ${reminders} This record does not confirm that a dose was taken.`;
  }
  if (record.type === "appointment") {
    const offsets = record.reminderOffsets.length ? ` (${record.reminderOffsets.map((offset) => `${offset} minutes before`).join(", ")})` : "";
    return `Appointment record: ${record.title}. ${details} Scheduled for ${when}. ${record.remindersEnabled ? `Hale reminders are enabled${offsets}.` : "Hale reminders are not enabled."} This saved record does not confirm booking or attendance.`;
  }
  if (record.type === "care_cost") {
    const amount = record.amount === null ? "Amount not recorded." : `Recorded amount: ${moneyLabel(record.amount, record.currency)}.`;
    const status = record.status ? ` Recorded status: ${record.status}.` : "";
    const shared = record.source === "shared_cost" || record.source === "nessie_demo" && record.sharedWithPatient ? " This item was shared with the patient space." : "";
    return `Care-cost record: ${record.title}. ${amount} Date: ${when}. ${details}${status}${shared} A recorded payment is not evidence that care occurred.`;
  }
  const amount = record.amount === null ? "" : ` Recorded amount: ${moneyLabel(record.amount, record.currency)}.`;
  return `Ride record: ${record.title}.${amount} Date: ${when}. ${details} This record does not confirm that a ride was booked or taken.`;
}

function careRecordCitation(record: CareRecord): CareRecordCitation {
  const typeLabel = record.type === "care_cost" ? "Care cost" : record.type[0].toUpperCase() + record.type.slice(1);
  const excerpt = careRecordExcerpt(record);
  return {
    sourceType: "care_record",
    recordId: record.id,
    recordType: record.type,
    scheduledAt: record.scheduledAt,
    date: careRecordDate(record),
    label: `${typeLabel} · ${record.title}`,
    excerpt: excerpt.length > 440 ? `${excerpt.slice(0, 437)}…` : excerpt,
  };
}

function careRecordAnswers(
  question: string,
  today: string,
  requestedDay: string | undefined,
  records: CareRecord[],
  inaccessibleTypes: CareRecordType[],
): { answer?: RecallAnswer; noRecord?: RecallAnswer } {
  const types = requestedCareTypes(question);
  if (!careRecordIntent(question, types)) return {};
  if (types.includes("medication") && /\b(should i|can i|is it safe|safe to|how much should|how many (?:pills|doses)|missed dose|take another|double (?:my |the )?dose)\b/i.test(question)) {
    return { answer: { text: "I can show what a medication record says, but I can’t tell you what dose to take or whether a dose is safe. Please ask your pharmacist or clinician about medication decisions.", citations: [], insufficient: true } };
  }
  if (types.includes("medication") && /\b(did i take|have i taken|was (?:the|my) dose taken|did i (?:miss|skip))\b/i.test(question)) {
    return { answer: { text: "I can show the recorded medication schedule and reminder settings, but these records don’t say whether a dose was taken. I won’t guess from a reminder or schedule.", citations: [], insufficient: true } };
  }

  const genericReminder = /\b(reminder|reminders|remind|schedule|scheduled|due)\b/i.test(question);
  const requestedTypes: CareRecordType[] = types.length ? types : genericReminder ? ["appointment", "medication", "ride"] : careRecordTypes;
  const inaccessible = requestedTypes.filter((type) => inaccessibleTypes.includes(type));
  if (types.length && inaccessible.length === types.length) {
    const label = inaccessible[0] === "care_cost" ? "care-cost" : inaccessible[0];
    return { answer: { text: `I can’t access ${label} records from this account. Ask the patient-space administrator about access.`, citations: [], insufficient: true } };
  }
  if (!types.length && genericReminder && inaccessible.length === requestedTypes.length) {
    return { answer: { text: "I can’t access care-task reminder records from this account. Ask the patient-space administrator about access.", citations: [], insufficient: true } };
  }
  const inaccessibleNote = inaccessible.length ? ` I can’t access ${inaccessible.map((type) => type === "care_cost" ? "care-cost" : type).join(" or ")} records from this account.` : "";
  let matching = records.filter((record) => requestedTypes.includes(record.type) && !inaccessibleTypes.includes(record.type));
  const range = careDateRange(question, today);
  matching = matching.filter((record) => {
    const date = careRecordDate(record);
    if (requestedDay) return record.type === "medication" ? !date || date <= requestedDay : date === requestedDay;
    if (range) return record.type === "medication" ? !date || date <= range.through : Boolean(date && date >= range.from && date <= range.through);
    return true;
  });

  const upcoming = /\b(next|upcoming|tomorrow|today|due|scheduled|remind)\b/i.test(question);
  if (upcoming && !requestedDay && !range) {
    matching = matching.filter((record) => {
      const date = careRecordDate(record);
      if (record.type === "medication") return true;
      if (record.type === "care_cost") return record.status === "upcoming" || Boolean(date && date >= today);
      return Boolean(date && date >= today);
    });
  }

  const queryCategoryWords = types.length === 1 && types[0] === "care_cost" ? careCostQueryWords : careQueryWords;
  const topicTokens = [...new Set(question.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((word) => !stopwords.has(word) && !queryCategoryWords.has(word));
  if (topicTokens.length) {
    const ranked = matching.map((record) => {
      const date = careRecordDate(record);
      const dateText = date ? `${date} ${dateLabel(date)}` : "";
      const haystack = `${record.title} ${record.details} ${record.status ?? ""} ${record.amount ?? ""} ${dateText}`.toLowerCase();
      return { record, score: topicTokens.reduce((score, word) => score + (new RegExp(`\\b${word}\\b`, "i").test(haystack) ? 1 : 0), 0) };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    if (ranked.length) matching = ranked.map((item) => item.record);
    else if (!upcoming) matching = [];
  }
  matching.sort((a, b) => {
    if (a.type === "medication" && b.type !== "medication") return -1;
    if (a.type !== "medication" && b.type === "medication") return 1;
    return upcoming && (a.type === "appointment" || a.type === "ride")
      ? (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)
      : (b.scheduledAt ?? 0) - (a.scheduledAt ?? 0);
  });

  if (!matching.length) {
    const noRecordText = types.length === 1 && types[0] === "appointment"
      ? "I don’t see a matching appointment record in Care & Tasks. A missing record doesn’t mean an appointment wasn’t booked."
      : types.length === 1 && types[0] === "medication"
        ? "I don’t see a matching medication record in Care & Tasks. A missing record doesn’t tell us what medication you should take."
        : types.length === 1 && types[0] === "care_cost"
          ? "I don’t see a matching saved or shared care-cost record. A missing record doesn’t mean a cost wasn’t incurred."
          : "I don’t see a matching care record in Care & Tasks. A missing record doesn’t mean something didn’t happen.";
    return { noRecord: { text: noRecordText + inaccessibleNote, citations: [], insufficient: true } };
  }

  const selected = matching.slice(0, types.length ? 5 : 8);
  const citations = selected.map(careRecordCitation);
  const containsMedication = selected.some((record) => record.type === "medication");
  return {
    answer: {
      text: `${selected.map(careRecordExcerpt).join(" ")}${containsMedication ? " These are recorded instructions and reminders, not medical advice or proof that a dose was taken." : ""}${inaccessibleNote}`,
      citations,
      insufficient: false,
    },
  };
}

/** Deterministic, source-bound recall. No model calls, semantic search, or external actions. */
export function recallEvidence(
  space: PatientSpace,
  question: string,
  today: string,
  fixedDay?: string,
  careRecords: CareRecord[] = [],
  inaccessibleCareRecordTypes: CareRecordType[] = [],
): RecallAnswer {
  const day = resolveDayQuestion(question, today, fixedDay);
  const lastWeek = !day && /\blast week\b/i.test(question);
  const rangeStart = lastWeek ? shiftDate(today, -7) : undefined;
  const rangeEnd = lastWeek ? shiftDate(today, -1) : undefined;
  const available = space.conversations.filter((conversation) =>
    conversation.state === "ready" && (!day || localDate(conversation.startedAt, space.timezone) === day)
      && (!rangeStart || localDate(conversation.startedAt, space.timezone) >= rangeStart)
      && (!rangeEnd || localDate(conversation.startedAt, space.timezone) <= rangeEnd),
  );
  const abstain: RecallAnswer = {
    text: "I don’t have enough recorded information to answer that. A missing recording doesn’t mean something didn’t happen.",
    citations: [], insufficient: true,
  };
  // Deliberate questions and untrusted source text must never become tool executions.
  if (/\b(emergency|911|suicid\w*)\b|\b(can.?t breathe|chest pain|hurt myself)\b/i.test(question)) {
    return { text: "If you may be in immediate danger, call your local emergency number now or ask a nearby trusted person for help. Hale is not emergency monitoring and has not contacted anyone.", citations: [], insufficient: true };
  }

  const asksAboutConversation = /\b(say|said|tell|told|talk|talked|conversation|recording|transcript|discuss|discussed|mentioned)\b/i.test(question);
  const careResult = careRecordAnswers(question, today, day, careRecords, inaccessibleCareRecordTypes);
  if (careResult.answer && (!asksAboutConversation || careResult.answer.insufficient)) return careResult.answer;
  const types = requestedCareTypes(question);
  const isCareQuery = careRecordIntent(question, types);
  if (/\b(last month|last year)\b/i.test(question) && !isCareQuery) {
    return { text: "Recall supports today, yesterday, the last seven complete days, and a selected calendar day. Choose a date in Memories to scope the answer to a specific day.", citations: [], insufficient: true };
  }
  if (/\b(who|whom)\b.*\b(meet|speak|talk|conversation)\b/i.test(question)) {
    const known = space.people.filter((person) => person.relationship !== "You · patient" && available.some((conversation) =>
      conversation.turns.some((turn) => turn.personId === person.id && !turn.uncertain),
    ));
    if (!known.length) return abstain;
    const citations = known.map((person): Citation => {
      const conversation = available.find((item) => item.turns.some((turn) => turn.personId === person.id && !turn.uncertain))!;
      const turn = conversation.turns.find((item) => item.personId === person.id && !item.uncertain)!;
      return { conversationId: conversation.id, turnId: turn.id, timestamp: turn.start, label: `${person.name.split(" ")[0]} · ${conversation.title}`, excerpt: turn.text };
    });
    return { text: `Your ${day ? "recordings from this day include" : "available recordings include"} conversations with ${known.map((person) => person.name.split(" ")[0]).join(" and ")}. A recording doesn’t establish whether you met in person.`, citations, insufficient: false };
  }
  const tokens = question.toLowerCase().match(/[a-z]+/g)?.filter((word) => !stopwords.has(word)) ?? [];
  const queriedPeople = space.people.filter((person) => question.toLocaleLowerCase().split(/[^\p{L}\p{N}'’-]+/u).includes(person.name.split(/\s+/)[0].toLocaleLowerCase()));
  const nameTokens = new Set(queriedPeople.flatMap((person) => person.name.toLowerCase().split(" ")));
  const topicTokens = tokens.filter((token) => !nameTokens.has(token));
  const broad = (/what (did|have) (i|we)|recap|summari[sz]e|my day/i.test(question) && tokens.every((word) => ["day", "recap", "summarize", "summarise", "happen", "happened"].includes(word)))
    || (lastWeek && /\bwhat happened\b/i.test(question));
  const candidates = space.memories.filter((memory) => available.some((conversation) => conversation.id === memory.conversationId && memory.turnIds.length > 0 && memory.turnIds.every((id) => conversation.turns.some((turn) => turn.id === id))))
    .filter((memory) => !queriedPeople.length || available.some((conversation) => conversation.id === memory.conversationId && conversation.turns.some((turn) => !turn.uncertain && memory.turnIds.includes(turn.id) && queriedPeople.some((person) => person.id === turn.personId))))
    .map((memory) => ({ memory, score: topicTokens.reduce((score, word) => score + (new RegExp(`\\b${word}\\b`, "i").test(`${memory.title} ${memory.text}`) ? 1 : 0), 0) }))
    .filter((item) => broad || item.score > 0 || (queriedPeople.length > 0 && topicTokens.length === 0))
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) {
    // A processed transcript is still useful before structured memory extraction is available.
    // Quote words verbatim rather than presenting a generated interpretation as an event.
    const matches = available.flatMap((conversation) => conversation.turns.filter((turn) =>
      (!queriedPeople.length || (!turn.uncertain && queriedPeople.some((person) => person.id === turn.personId))) &&
      (broad || (topicTokens.length > 0 && topicTokens.some((word) => new RegExp(`\\b${word}\\b`, "i").test(turn.text))) || (queriedPeople.length > 0 && topicTokens.length === 0)),
    ).map((turn) => ({ conversation, turn })));
    if (!matches.length) return asksAboutConversation ? abstain : careResult.noRecord ?? abstain;
    const selected = matches.slice(0, broad ? 6 : 2);
    return {
      text: `Your recordings include these words: ${selected.map(({ turn }) => `${turn.speaker}: “${turn.text}”`).join(" ")}${matches.length > selected.length ? " More matching words are available in the original conversations." : ""} These are recorded statements, not verified events.`,
      citations: selected.map(({ conversation, turn }) => ({ conversationId: conversation.id, turnId: turn.id, timestamp: turn.start, label: `${turn.speaker} · ${conversation.title}`, excerpt: turn.text })),
      insufficient: false,
    };
  }
  const selected = broad ? candidates : candidates.slice(0, 2);
  return {
    text: selected.map(({ memory }) => memory.text).join(" "),
    citations: selected.flatMap(({ memory }) => {
      const conversation = available.find((item) => item.id === memory.conversationId)!;
      return memory.turnIds.slice(0, 1).flatMap((id) => {
        const turn = conversation.turns.find((item) => item.id === id);
        return turn ? [{ conversationId: conversation.id, turnId: turn.id, timestamp: turn.start, label: `${turn.speaker} · ${conversation.title}`, excerpt: turn.text }] : [];
      });
    }),
    insufficient: false,
  };
}

export const recallDemo = recallEvidence;
