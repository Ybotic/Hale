import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { appMode } from "@/lib/app-mode";

const clerk = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (appMode !== "live" || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return NextResponse.next();
  return clerk(request, event);
}

export const config = { matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)", "/(api|trpc)(.*)"] };
