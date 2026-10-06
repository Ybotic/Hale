"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useState, type ReactNode } from "react";

function ConvexBridge({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("Set NEXT_PUBLIC_CONVEX_URL for the dashboard.");
    return new ConvexReactClient(url);
  });
  return <ConvexProviderWithClerk client={client} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}

export function Providers({ children }: { children: ReactNode }) {
  return <ClerkProvider><ConvexBridge>{children}</ConvexBridge></ClerkProvider>;
}
