import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("purge-expired-audio", { hourUTC: 3, minuteUTC: 15 }, internal.retention.purgeExpiredAudio, {});

export default crons;
