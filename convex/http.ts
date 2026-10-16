import { httpRouter, makeFunctionReference } from "convex/server";
import { httpAction } from "./lib/functions";
import type { GenericId } from "convex/values";
import { validateVoiceWav, VOICE_MAX_BYTES } from "@hale/contracts/voice";

const http = httpRouter();
const acceptChunk = makeFunctionReference<"mutation">("recordings:acceptChunk");
const authorizeUpload = makeFunctionReference<"query">("recordings:authorizeUpload");
const authorizeVoice = makeFunctionReference<"query">("voices:authorizeUpload");
const acceptVoice = makeFunctionReference<"mutation">("voices:accept");

function cors(origin: string | null): Record<string, string> {
  const allowed = process.env.APP_ORIGIN;
  return allowed && origin === allowed ? {
    "Access-Control-Allow-Origin": allowed, "Vary": "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } : {};
}

http.route({ path: "/audio", method: "OPTIONS", handler: httpAction(async (_ctx, request) =>
  new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),
) });

http.route({
  path: "/audio", method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = { ...cors(request.headers.get("origin")), "Cache-Control": "no-store" };
    if (!process.env.APP_ORIGIN || request.headers.get("origin") !== process.env.APP_ORIGIN) return new Response("Origin not allowed.", { status: 403, headers });
    if (!await ctx.auth.getUserIdentity()) return new Response("Sign in required.", { status: 401, headers });
    const url = new URL(request.url);
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^(audio\/(mp4|webm|ogg|wav|x-wav|mpeg)|video\/mp4)(;|$)/i.test(contentType)) return new Response("Unsupported audio container.", { status: 415, headers });
    if (Number(request.headers.get("content-length")) > 20_000_000) return new Response("Segment too large.", { status: 413, headers });
    let storageId: GenericId<"_storage"> | undefined;
    try {
      // Check membership before accepting bytes, then recheck atomically at finalization.
      await ctx.runQuery(authorizeUpload, { sessionId: url.searchParams.get("sessionId") });
      const blob = await request.blob();
      if (!blob.size || blob.size > 20_000_000) return new Response("Empty or oversized segment.", { status: 413, headers });
      storageId = await ctx.storage.store(blob);
      const result = await ctx.runMutation(acceptChunk, {
        sessionId: url.searchParams.get("sessionId"), sequence: Number(url.searchParams.get("sequence")),
        capturedAt: Number(url.searchParams.get("capturedAt")), endedAt: Number(url.searchParams.get("endedAt")),
        storageId, mimeType: contentType,
      }) as { chunkId: string; duplicate: boolean };
      if (result.duplicate) await ctx.storage.delete(storageId);
      return Response.json(result, { headers });
    } catch {
      if (storageId) await ctx.storage.delete(storageId);
      return new Response("Upload could not be accepted. Check your session and permissions.", { status: 400, headers });
    }
  }),
});

http.route({ path: "/voice", method: "OPTIONS", handler: httpAction(async (_ctx, request) =>
  new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),
) });

http.route({ path: "/voice", method: "POST", handler: httpAction(async (ctx, request) => {
  const headers = { ...cors(request.headers.get("origin")), "Cache-Control": "no-store" };
  if (!process.env.APP_ORIGIN || request.headers.get("origin") !== process.env.APP_ORIGIN) return new Response("Origin not allowed.", { status: 403, headers });
  if (!await ctx.auth.getUserIdentity()) return new Response("Sign in required.", { status: 401, headers });
  if (request.headers.get("content-type") !== "audio/wav") return new Response("A PCM WAV sample is required.", { status: 415, headers });
  if (Number(request.headers.get("content-length")) > VOICE_MAX_BYTES) return new Response("Sample too large.", { status: 413, headers });
  const url = new URL(request.url);
  if (url.searchParams.get("consent") !== "true") return new Response("Voice enrollment consent is required.", { status: 400, headers });
  let storageId: GenericId<"_storage"> | undefined;
  try {
    const authorization = await ctx.runQuery(authorizeVoice, {}) as { version: number };
    const reader = request.body?.getReader();
    if (!reader) return new Response("Empty sample.", { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > VOICE_MAX_BYTES) { await reader.cancel(); return new Response("Sample too large.", { status: 413, headers }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const buffer = bytes.buffer;
    try { validateVoiceWav(buffer); }
    catch (error) { return new Response(error instanceof Error ? error.message : "Invalid sample.", { status: 400, headers }); }
    storageId = await ctx.storage.store(new Blob([buffer], { type: "audio/wav" }));
    const result = await ctx.runMutation(acceptVoice, { storageId, requestId: url.searchParams.get("requestId"), consent: true, expectedVersion: authorization.version }) as { duplicate: boolean };
    if (result.duplicate) await ctx.storage.delete(storageId);
    return Response.json({ accepted: true }, { headers });
  } catch {
    if (storageId) await ctx.storage.delete(storageId);
    return new Response("Sample not accepted. Check your connection, voice profile, and service configuration.", { status: 400, headers });
  }
}) });

export default http;
