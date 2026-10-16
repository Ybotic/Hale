import { cronJobs, makeFunctionReference } from "convex/server";
const crons = cronJobs();
const expireAudio = makeFunctionReference<"mutation">("privacy:expireAudio");
crons.interval("expire raw conversation audio", { minutes: 30 }, expireAudio, {});
crons.interval("expire abandoned voice samples", { minutes: 15 }, makeFunctionReference<"mutation">("voices:expireSamples"), {});
export default crons;
