import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";

const bodySchema = z.object({ code: z.string().trim().min(6).max(12) });

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !convexUrl) {
    return NextResponse.json({ error: "Pairing service is not configured." }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const { code } = bodySchema.parse(body);
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(token);
    const result = await convex.action(api.pairing.claimPairingCode, { code });

    return NextResponse.json({ seniorId: result.seniorId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pairing could not be completed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
