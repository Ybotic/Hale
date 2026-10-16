import { v, ConvexError } from "convex/values";
import { recallEvidence } from "@hale/contracts/recall";
import { isLocalDate, localDate, resolveDayQuestion } from "@hale/contracts/time";
import { query } from "./lib/functions";
import { requireMember } from "./authz";
import { loadSpace } from "./conversations";

// Reactive, read-only extraction. Generated prose never enters the evidence bank.
export const recall = query({
  args: { patientId: v.id("patients"), question: v.string(), day: v.optional(v.string()) },
  handler: async (ctx, { patientId, question, day }) => {
    const { patient } = await requireMember(ctx, patientId, "memories:read");
    if (!question.trim() || question.length > 1000) throw new ConvexError("Enter a question between 1 and 1000 characters.");
    if (day !== undefined && !isLocalDate(day)) throw new ConvexError("Choose a valid calendar day.");
    const today = localDate(new Date(), patient.timezone);
    const selected = resolveDayQuestion(question, today, day);
    const { space, limited } = await loadSpace(ctx, patientId, { day: selected, includeTurns: true });
    const answer = recallEvidence(space, question, today, day);
    return { ...answer, text: answer.text + (limited ? " This answer covers a limited set of available records, not the whole day. Select a day or review the original conversations for more context." : "") };
  },
});
