import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Slot } from "expo-router";
import { convex } from "../src/lib/convex";

function requirePublishableKey(): string {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) throw new Error("Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY for the mobile app.");
  return key;
}

const publishableKey = requirePublishableKey();

function AuthenticatedApp() {
  return <ConvexProviderWithClerk client={convex} useAuth={useAuth}><Slot /></ConvexProviderWithClerk>;
}

export default function RootLayout() {
  const tokenCacheProps = tokenCache ? { tokenCache } : {};
  return <ClerkProvider publishableKey={publishableKey} {...tokenCacheProps}><AuthenticatedApp /></ClerkProvider>;
}
