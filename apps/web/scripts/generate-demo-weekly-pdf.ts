import { writeFile } from "node:fs/promises";
import { demoSpace, DEMO_TODAY } from "@hale/contracts/demo";
import { shiftDate } from "@hale/contracts/time";
import { buildDemoWeeklyAiSummary, buildWeeklyConversationPdf } from "../src/lib/weekly-conversation-pdf";

const fromDay = shiftDate(DEMO_TODAY, -6);
const bytes = await buildWeeklyConversationPdf({
  name: demoSpace.name,
  timezone: demoSpace.timezone,
  people: demoSpace.people,
  conversations: demoSpace.conversations,
  memories: demoSpace.memories,
  fromDay,
  throughDay: DEMO_TODAY,
  limited: false,
  demo: true,
  aiSummary: buildDemoWeeklyAiSummary(demoSpace),
});

await writeFile(new URL("../public/demo-weekly-summary.pdf", import.meta.url), Buffer.from(bytes));
