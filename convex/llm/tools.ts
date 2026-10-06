import { tool } from "ai";
import {
  emptyToolInputSchema,
  logMedicationToolInputSchema,
  markBillPaidToolInputSchema,
  type CardPayload,
} from "@snow/shared";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";

type ToolContext = {
  ctx: ActionCtx;
  actorId: Id<"users">;
  sessionId: Id<"sessions">;
  setCard: (card: CardPayload) => void;
};

export function buildSessionTools({ ctx, actorId, sessionId, setCard }: ToolContext) {
  return {
    get_medications: tool({
      description: "Get the senior's active medication schedule. Use this when asked about medicines or when medicine details are needed.",
      parameters: emptyToolInputSchema,
      execute: async () => {
        const medications: Doc<"medications">[] = await ctx.runQuery(internal.medications.listForActiveSession, { sessionId, actorId });
        const card: CardPayload = {
          type: "medication_schedule",
          title: "Medication schedule",
          items: medications.map((medication) => ({
            medicationId: medication._id,
            name: medication.name,
            dosage: medication.dosage,
            instructions: medication.instructions,
            schedule: medication.schedule,
          })),
        };
        setCard(card);
        return { medications: card.items };
      },
    }),
    log_medication: tool({
      description: "Record that the senior took or skipped one of their listed medicines.",
      parameters: logMedicationToolInputSchema,
      execute: async (input) => {
        const result = await ctx.runMutation(internal.medications.logFromActiveSession, {
          sessionId,
          actorId,
          medicationId: input.medicationId as Id<"medications">,
          status: input.status,
          ...(input.note === undefined ? {} : { note: input.note }),
        });
        return { message: `${result.medicationName} marked ${result.status}.` };
      },
    }),
    get_emergency_contacts: tool({
      description: "Get the senior's emergency contacts and their phone numbers.",
      parameters: emptyToolInputSchema,
      execute: async () => {
        const contacts: Doc<"emergencyContacts">[] = await ctx.runQuery(internal.emergencyContacts.listForActiveSession, { sessionId, actorId });
        const card: CardPayload = {
          type: "emergency_contacts",
          title: "Emergency contacts",
          items: contacts.map(({ name, relationship, phone }) => ({ name, relationship, phone })),
        };
        setCard(card);
        return { contacts: card.items };
      },
    }),
    get_unpaid_bills: tool({
      description: "Get unpaid bills, including their payees, amounts, and due dates.",
      parameters: emptyToolInputSchema,
      execute: async () => {
        const bills: Doc<"bills">[] = await ctx.runQuery(internal.bills.listUnpaidForActiveSession, { sessionId, actorId });
        const card: CardPayload = {
          type: "unpaid_bills",
          title: "Unpaid bills",
          items: bills.map((bill) => ({
            billId: bill._id,
            payee: bill.payee,
            description: bill.description,
            amountCents: bill.amountCents,
            dueAt: bill.dueAt,
          })),
        };
        setCard(card);
        return { bills: card.items };
      },
    }),
    mark_bill_paid: tool({
      description: "Mark a listed bill as paid when the senior says it has been paid.",
      parameters: markBillPaidToolInputSchema,
      execute: async (input) => {
        const result = await ctx.runMutation(internal.bills.markPaidFromActiveSession, {
          sessionId,
          actorId,
          billId: input.billId as Id<"bills">,
        });
        return { message: result.alreadyPaid ? `${result.payee} is already marked paid.` : `${result.payee} marked paid.` };
      },
    }),
  };
}
