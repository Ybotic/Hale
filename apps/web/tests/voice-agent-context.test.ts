import { expect, test } from "bun:test";
import { relevantSources, restrictedRecordType } from "../src/lib/server/voice-agent";

test("conversation recall keeps transcript turns ahead of unrelated records", () => {
  const sources = [
    ...Array.from({ length: 20 }, (_, index) => ({ id: `memory-${index}`, kind: "memory", label: "memory", text: "unrelated saved detail" })),
    ...Array.from({ length: 40 }, (_, index) => ({ id: `care-${index}`, kind: "appointment", label: "appointment", text: "unrelated appointment" })),
    ...Array.from({ length: 20 }, (_, index) => ({ id: `turn-${index}`, kind: "transcript", label: "Patient · conversation", text: `recorded statement ${index}` })),
  ];

  const selected = relevantSources("What did I tell you last week?", sources);

  expect(selected).toHaveLength(8);
  expect(selected.every((source) => source.kind === "transcript")).toBe(true);
});

test("upcoming questions prioritize appointment and medication records", () => {
  const sources = [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `memory-${index}`, kind: "memory", label: "memory", text: "unrelated saved detail" })),
    { id: "appointment-1", kind: "appointment", label: "appointment · cardiology", text: "Follow-up visit" },
    { id: "medication-1", kind: "medication", label: "medication · tablet", text: "Patient-entered record" },
  ];

  const selected = relevantSources("What do I have due tomorrow?", sources);

  expect(selected.map((source) => source.id)).toEqual(["appointment-1", "medication-1"]);
});

test("broad questions keep several readable record categories in context", () => {
  const sources = [
    ...Array.from({ length: 20 }, (_, index) => ({ id: `memory-${index}`, kind: "memory", label: "memory", text: "saved detail" })),
    { id: "appointment-1", kind: "appointment", label: "appointment", text: "clinic visit" },
    { id: "medication-1", kind: "medication", label: "medication", text: "patient-entered medication record" },
    { id: "ride-1", kind: "ride", label: "ride", text: "transport record" },
    { id: "cost-1", kind: "care_cost", label: "care cost", text: "pharmacy receipt" },
  ];

  const selectedKinds = relevantSources("Can you help me?", sources).map((source) => source.kind);

  expect(selectedKinds).toContain("appointment");
  expect(selectedKinds).toContain("medication");
  expect(selectedKinds).toContain("ride");
  expect(selectedKinds).toContain("care_cost");
});

test("care questions distinguish missing access from an absent record", () => {
  expect(restrictedRecordType("When is my next appointment?", ["memories:read"])).toBe("appointment");
  expect(restrictedRecordType("When is my next appointment?", ["memories:read", "appointments:book"])).toBeNull();
});
