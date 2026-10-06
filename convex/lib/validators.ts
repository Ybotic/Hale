import { v } from "convex/values";

export const seniorIdValidator = v.id("users");
export const medicationIdValidator = v.id("medications");
export const contactIdValidator = v.id("emergencyContacts");
export const billIdValidator = v.id("bills");
export const sessionIdValidator = v.id("sessions");

export const scheduleValidator = v.array(v.object({
  daysOfWeek: v.array(v.number()),
  times: v.array(v.string()),
}));
