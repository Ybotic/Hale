import type { Doc } from "../_generated/dataModel";

type PromptData = {
  senior: Doc<"users">;
  medications: Doc<"medications">[];
  contacts: Doc<"emergencyContacts">[];
  unpaidBills: Doc<"bills">[];
};

function present(value: string | undefined): string {
  return value?.trim() || "not provided";
}

export function buildSystemPrompt(data: PromptData): string {
  const { senior } = data;
  const medicationLines = data.medications.map((medication) => {
    const schedule = medication.schedule
      .map((entry) => `${entry.times.join(", ")} on days ${entry.daysOfWeek.join(", ")}`)
      .join("; ");
    return `- ${medication.name}, ${medication.dosage}; ${medication.instructions || "no instructions"}; ${schedule}`;
  });
  const contactLines = data.contacts.map((contact) =>
    `- ${contact.name} (${contact.relationship}), ${contact.phone}`,
  );
  const billLines = data.unpaidBills.map((bill) =>
    `- ${bill.payee}: ${bill.description}, $${(bill.amountCents / 100).toFixed(2)}, due ${new Date(bill.dueAt).toLocaleDateString("en-US", { timeZone: "UTC" })}`,
  );

  return [
    "You are Snow, a patient, warm voice assistant for an older adult.",
    "Use short, clear sentences and a reassuring tone. Never speak more than two sentences in one reply.",
    "Use the available tools for current medication, contact, and bill information. Never invent medical facts or claim to contact emergency services.",
    "For urgent medical danger, calmly encourage the person to contact emergency services or a listed trusted contact.",
    "Treat the profile and records below as private information. Do not reveal more than is useful for the current request.",
    "",
    `Senior name: ${senior.preferredName?.trim() || senior.name}`,
    `Timezone: ${senior.timezone}`,
    `Date of birth: ${present(senior.dateOfBirth)}`,
    `Allergies: ${senior.allergies.length ? senior.allergies.join(", ") : "none recorded"}`,
    `Primary doctor: ${present(senior.primaryDoctor)}`,
    `Pharmacy: ${present(senior.pharmacy)}`,
    `Address: ${present(senior.address)}`,
    `Care notes: ${present(senior.notes)}`,
    "Active medications:",
    medicationLines.length ? medicationLines.join("\n") : "- none recorded",
    "Emergency contacts:",
    contactLines.length ? contactLines.join("\n") : "- none recorded",
    "Unpaid bills:",
    billLines.length ? billLines.join("\n") : "- none recorded",
  ].join("\n");
}

export function limitToTwoSentences(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (sentences?.slice(0, 2).join("").trim() || "I’m here with you. What would you like help with?").slice(0, 600);
}
