import type { CareRecord, PatientSpace } from "./index";
import { PATIENT_CAPABILITIES } from "./index";

// Entirely fictional. Fixed dates make the demo reproducible; never present as live data.
export const DEMO_TODAY = "2026-10-15";
function demoNessieCost(id: string, title: string, merchant: string, amount: number, date: string, status: string, sharedWithPatient: boolean): CareRecord {
  return {
    id, type: "care_cost", title, details: `${merchant} · fictional Nessie sandbox record`, scheduledAt: null, localDate: date,
    amount, currency: "USD", source: "nessie_demo", recurrence: "none", reminderTimes: [], reminderDays: [],
    reminderOffsets: [], remindersEnabled: false, timezone: "America/New_York", status, sharedWithPatient,
  };
}

export const demoCareRecords: CareRecord[] = [
  { id: "demo-ride-clinic", type: "ride", title: "Clinic ride", details: "Home to Cedar Grove Clinic · fictional route", scheduledAt: new Date("2026-10-21T09:30:00-04:00").getTime(), amount: 16.5, currency: "USD", source: "demo", recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [], remindersEnabled: false, timezone: "America/New_York", canDelete: true },
  { id: "demo-appointment-clinic", type: "appointment", title: "Primary care follow-up", details: "Cedar Grove Clinic · Dr. Lena Morgan", scheduledAt: new Date("2026-10-21T10:30:00-04:00").getTime(), amount: 0, currency: "USD", source: "demo", recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [1440, 60], remindersEnabled: true, timezone: "America/New_York", canDelete: true },
  { id: "demo-appointment-eye", type: "appointment", title: "Eye exam", details: "Oak Street Optometry · Grace will come along", scheduledAt: new Date("2026-10-27T14:00:00-04:00").getTime(), amount: 0, currency: "USD", source: "demo", recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [1440, 60], remindersEnabled: true, timezone: "America/New_York", canDelete: true },
  { id: "demo-medication-a", type: "medication", title: "Example medication A", details: "Fictional demo directions: one tablet in the morning.", scheduledAt: new Date("2026-10-15T08:00:00-04:00").getTime(), amount: null, currency: "USD", source: "demo", recurrence: "daily", reminderTimes: ["08:00"], reminderDays: [], reminderOffsets: [], remindersEnabled: true, timezone: "America/New_York", canDelete: true },
  { id: "demo-medication-b", type: "medication", title: "Example vitamin", details: "Fictional demo note: keep with breakfast supplies.", scheduledAt: new Date("2026-10-15T08:00:00-04:00").getTime(), amount: null, currency: "USD", source: "demo", recurrence: "daily", reminderTimes: ["08:00"], reminderDays: [], reminderOffsets: [], remindersEnabled: false, timezone: "America/New_York", canDelete: true },
  { id: "demo-care-cost-clinic", type: "care_cost", title: "Clinic copay", details: "Cedar Grove Clinic · fictional example", scheduledAt: new Date("2026-10-14T12:00:00-04:00").getTime(), amount: 35, currency: "USD", source: "demo", recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [], remindersEnabled: false, timezone: "America/New_York", canDelete: true },
  { id: "demo-care-cost-pharmacy", type: "care_cost", title: "Pharmacy purchase", details: "Neighborhood Pharmacy · fictional example", scheduledAt: new Date("2026-10-13T12:00:00-04:00").getTime(), amount: 18.5, currency: "USD", source: "demo", recurrence: "none", reminderTimes: [], reminderDays: [], reminderOffsets: [], remindersEnabled: false, timezone: "America/New_York", canDelete: true },
  demoNessieCost("demo-bill-clinic", "Primary care copay", "Cedar Grove Clinic", 35, "2026-10-20", "upcoming", true),
  demoNessieCost("demo-bill-eye", "Eye exam copay", "Oak Street Optometry", 45, "2026-10-27", "upcoming", false),
  demoNessieCost("demo-bill-therapy", "Physical therapy visit", "Lakeside Therapy", 28, "2026-10-29", "upcoming", false),
  demoNessieCost("demo-purchase-pharmacy", "Prescription copay", "Neighborhood Pharmacy", 18.5, "2026-10-14", "posted", true),
  demoNessieCost("demo-purchase-groceries", "Groceries for the week", "Fresh Market", 46.2, "2026-10-13", "posted", false),
  demoNessieCost("demo-purchase-parking", "Clinic parking", "Cedar Grove Clinic", 6, "2026-10-12", "posted", true),
  demoNessieCost("demo-purchase-transit", "Community shuttle", "County Mobility", 12, "2026-10-11", "posted", false),
  demoNessieCost("demo-transfer-family", "Family care contribution", "Grace Okafor", 50, "2026-10-10", "completed", false),
];

export const demoSpace: PatientSpace = {
  id: "demo-margaret",
  name: "Margaret Okafor",
  timezone: "America/New_York",
  capabilities: PATIENT_CAPABILITIES,
  people: [
    { id: "margaret", name: "Margaret Okafor", initials: "MO", relationship: "You · patient", enrollment: "enrolled", color: "green" },
    { id: "grace", name: "Grace Okafor", initials: "GO", relationship: "Sister", enrollment: "enrolled", color: "blue" },
    { id: "daniel", name: "Daniel Okafor", initials: "DO", relationship: "Son", enrollment: "enrolled", color: "sand" },
  ],
  conversations: [
    {
      id: "garden-lunch", title: "Lunch, the garden & Sunday plans",
      summary: "Margaret and Grace talked about lunch at the garden café, the tomato harvest, and bringing a photo album on Sunday.",
      startedAt: "2026-10-15T16:15:00Z", duration: 864,
      people: ["margaret", "grace"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "lunch-1", speaker: "Margaret", personId: "margaret", start: 0, end: 12, text: "It was lovely having lunch at the garden café today. I think that little table by the window is my favorite." },
        { id: "lunch-2", speaker: "Grace", personId: "grace", start: 14, end: 27, text: "Mine too. And the tomatoes you brought me look wonderful. Have you still got many in the garden?" },
        { id: "lunch-3", speaker: "Margaret", personId: "margaret", start: 30, end: 44, text: "The tomatoes finally came in. I have more than I know what to do with. You must take another bag home." },
        { id: "lunch-4", speaker: "Grace", personId: "grace", start: 47, end: 61, text: "I’ll bring the old photo album on Sunday. The one with our pictures from the coast. We can look through it together." },
        { id: "lunch-5", speaker: "Margaret", personId: "margaret", start: 64, end: 76, text: "Oh, I would love that. I remember the blue house we stayed in. We always had breakfast on the steps." },
        { id: "lunch-6", speaker: "Unknown speaker", start: 80, end: 86, text: "Would either of you like some more tea?", uncertain: true },
        { id: "lunch-7", speaker: "Grace", personId: "grace", start: 89, end: 99, text: "Yes, please. And Margaret, I’ll give you a call before I come on Sunday." },
      ],
    },
    {
      id: "morning-call", title: "A morning catch-up with Daniel",
      summary: "Daniel mentioned a new book and a plan to visit on Saturday. Margaret shared that she had watered the garden.",
      startedAt: "2026-10-15T13:10:00Z", duration: 372,
      people: ["margaret", "daniel"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "call-1", speaker: "Daniel", personId: "daniel", start: 0, end: 15, text: "Good morning, Mum. I found that book about the coast we were talking about. I’ll bring it over on Saturday." },
        { id: "call-2", speaker: "Margaret", personId: "margaret", start: 18, end: 30, text: "That sounds lovely. I’ve just finished watering the garden. It’s such a beautiful morning." },
        { id: "call-3", speaker: "Daniel", personId: "daniel", start: 34, end: 45, text: "I’m glad. I’ll call you again tomorrow. Enjoy your lunch with Grace." },
      ],
    },
    {
      id: "wednesday-walk", title: "A walk by the water",
      summary: "Margaret told Grace about a walk by the lake and the ducks she saw. They discussed the weather.",
      startedAt: "2026-10-14T19:30:00Z", duration: 486,
      people: ["margaret", "grace"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "walk-1", speaker: "Margaret", personId: "margaret", start: 0, end: 14, text: "I went for a walk by the lake this afternoon. The ducks were all gathered near the little bridge." },
        { id: "walk-2", speaker: "Grace", personId: "grace", start: 17, end: 26, text: "That sounds peaceful. Was it warm enough for you?" },
        { id: "walk-3", speaker: "Margaret", personId: "margaret", start: 29, end: 38, text: "It was just right with my cardigan. I sat on the bench for a little while." },
      ],
    },
    {
      id: "tuesday-garden", title: "Tomatoes & old family recipes",
      summary: "Margaret and Grace talked about their mother’s tomato soup and a harvest from the garden.",
      startedAt: "2026-10-13T14:12:00Z", duration: 612,
      people: ["margaret", "grace"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "garden-1", speaker: "Margaret", personId: "margaret", start: 0, end: 16, text: "I used to make tomato soup with Mum every autumn. She always added a little basil from the windowsill." },
        { id: "garden-2", speaker: "Grace", personId: "grace", start: 20, end: 31, text: "I remember. You told me you picked a whole basket of tomatoes this morning." },
      ],
    },
    {
      id: "monday-market", title: "A stop at the neighborhood market",
      summary: "Margaret mentioned picking up oranges and tea. Grace offered to add them to the next grocery list.",
      startedAt: "2026-10-12T14:40:00Z", duration: 308,
      people: ["margaret", "grace"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "market-1", speaker: "Margaret", personId: "margaret", start: 0, end: 13, text: "I picked up oranges and tea on the way home. The market was quiet this morning." },
        { id: "market-2", speaker: "Grace", personId: "grace", start: 16, end: 28, text: "I can add those to the grocery list for next week." },
      ],
    },
    {
      id: "sunday-photos", title: "Photos by the window",
      summary: "Margaret set family photos by the window, and Grace discussed bringing the album on another visit.",
      startedAt: "2026-10-11T15:15:00Z", duration: 264,
      people: ["margaret", "grace"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "photos-1", speaker: "Margaret", personId: "margaret", start: 0, end: 12, text: "I put the family photos by the window so we can look at them when you visit." },
        { id: "photos-2", speaker: "Grace", personId: "grace", start: 15, end: 27, text: "I can bring the old album next Sunday. It will be nice to see everyone together." },
      ],
    },
    {
      id: "saturday-walk", title: "Ducks near the footbridge",
      summary: "Margaret described a shaded trail and seeing ducks near the footbridge during a walk.",
      startedAt: "2026-10-10T13:05:00Z", duration: 296,
      people: ["margaret", "daniel"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "ducks-1", speaker: "Daniel", personId: "daniel", start: 0, end: 9, text: "How was the walk yesterday?" },
        { id: "ducks-2", speaker: "Margaret", personId: "margaret", start: 12, end: 26, text: "The trail was shady, and I saw the ducks near the footbridge." },
      ],
    },
    {
      id: "friday-seedlings", title: "Basil for the kitchen window",
      summary: "Grace offered to bring basil seedlings, and Margaret said there was room by the kitchen window.",
      startedAt: "2026-10-09T17:30:00Z", duration: 342,
      people: ["margaret", "grace"], state: "ready", audioAvailable: false, synthetic: true,
      turns: [
        { id: "seedlings-1", speaker: "Grace", personId: "grace", start: 0, end: 11, text: "Would you like me to bring the basil seedlings when I come over?" },
        { id: "seedlings-2", speaker: "Margaret", personId: "margaret", start: 14, end: 25, text: "Yes, there is room for them by the kitchen window." },
      ],
    },
  ],
  memories: [
    { id: "lunch-memory", kind: "reported_activity", title: "Lunch at the garden café", text: "Margaret said she enjoyed lunch at the garden café, at a table by the window.", localDate: "2026-10-15", conversationId: "garden-lunch", turnIds: ["lunch-1"], people: ["margaret", "grace"] },
    { id: "album-memory", kind: "plan", title: "A photo album for Sunday", text: "Grace said she would bring the old family photo album on Sunday and call before visiting.", localDate: "2026-10-15", plannedFor: "2026-10-18", conversationId: "garden-lunch", turnIds: ["lunch-4", "lunch-7"], people: ["grace"] },
    { id: "garden-memory", kind: "reported_activity", title: "A little time in the garden", text: "Margaret told Daniel she had finished watering the garden that morning.", localDate: "2026-10-15", conversationId: "morning-call", turnIds: ["call-2"], people: ["margaret", "daniel"] },
    { id: "book-memory", kind: "plan", title: "Daniel’s Saturday visit", text: "Daniel said he would bring a book about the coast on Saturday.", localDate: "2026-10-15", plannedFor: "2026-10-17", conversationId: "morning-call", turnIds: ["call-1"], people: ["daniel"] },
    { id: "walk-memory", kind: "reported_activity", title: "A walk by the lake", text: "Margaret told Grace she went for a walk by the lake and sat on a bench near the bridge.", localDate: "2026-10-14", conversationId: "wednesday-walk", turnIds: ["walk-1", "walk-3"], people: ["margaret", "grace"] },
    { id: "recipe-memory", kind: "personal_fact", title: "Mum’s tomato soup", text: "Margaret recalled making tomato soup with her mother in autumn, with basil from the windowsill. This is a past recollection, not an activity recorded that day.", localDate: "2026-10-13", conversationId: "tuesday-garden", turnIds: ["garden-1"], people: ["margaret"] },
    { id: "market-memory", kind: "reported_activity", title: "Oranges and tea", text: "Margaret said she picked up oranges and tea at the neighborhood market.", localDate: "2026-10-12", conversationId: "monday-market", turnIds: ["market-1"], people: ["margaret"] },
    { id: "photos-memory", kind: "plan", title: "Look through the photo album", text: "Grace said she could bring the old family album on her next Sunday visit.", localDate: "2026-10-11", plannedFor: "2026-10-18", conversationId: "sunday-photos", turnIds: ["photos-2"], people: ["grace"] },
    { id: "ducks-memory", kind: "reported_activity", title: "Ducks near the footbridge", text: "Margaret described seeing ducks near the footbridge during a walk.", localDate: "2026-10-10", conversationId: "saturday-walk", turnIds: ["ducks-2"], people: ["margaret", "daniel"] },
    { id: "seedlings-memory", kind: "plan", title: "Basil seedlings", text: "Grace offered to bring basil seedlings for the kitchen window.", localDate: "2026-10-09", plannedFor: "2026-10-15", conversationId: "friday-seedlings", turnIds: ["seedlings-1", "seedlings-2"], people: ["grace", "margaret"] },
  ],
};
