import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("Set EXPO_PUBLIC_CONVEX_URL for the mobile app.");

export const convex = new ConvexReactClient(convexUrl);
