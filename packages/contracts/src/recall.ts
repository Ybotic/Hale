import type { Citation, PatientSpace, RecallAnswer } from "./index";
import { localDate, resolveDayQuestion } from "./time";

const stopwords = new Set("a an the did do i we you my me our what who when where about with was were is it of to for have has had tell said say talked talk discuss discussed yesterday today on in and please".split(" "));

/** Deterministic, source-bound recall. No model calls, semantic search, or external actions. */
export function recallEvidence(space: PatientSpace, question: string, today: string, fixedDay?: string): RecallAnswer {
  const day = resolveDayQuestion(question, today, fixedDay);
  const available = space.conversations.filter((conversation) =>
    conversation.state === "ready" && (!day || localDate(conversation.startedAt, space.timezone) === day),
  );
  const abstain: RecallAnswer = {
    text: "I don’t have enough recorded information to answer that. A missing recording doesn’t mean something didn’t happen.",
    citations: [], insufficient: true,
  };
  // Deliberate questions and untrusted source text must never become tool executions.
  if (/\b(emergency|911|suicid\w*)\b|\b(can.?t breathe|chest pain|hurt myself)\b/i.test(question)) {
    return { text: "If you may be in immediate danger, call your local emergency number now or ask a nearby trusted person for help. Mnemo is not emergency monitoring and has not contacted anyone.", citations: [], insufficient: true };
  }
  if (/\b(uber|ride|appointment|medicine|medication|dose|pill|safe|emergency|911)\b/i.test(question)) {
    return { text: "For rides, appointments, and medication records, open Care & Tasks. Memory recall cannot book anything or verify whether a dose was taken. For personal medication advice, ask your pharmacist or clinician.", citations: [], insufficient: true };
  }
  if (/\b(last week|last month|last year)\b/i.test(question)) {
    return { text: "Recall supports today, yesterday, and a selected calendar day. Choose a date in Memories to keep the answer scoped to that day.", citations: [], insufficient: true };
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
  const broad = /what (did|have) (i|we)|recap|summari[sz]e|my day/i.test(question) && tokens.every((word) => ["day", "recap", "summarize", "summarise", "happen", "happened"].includes(word));
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
    if (!matches.length) return abstain;
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
