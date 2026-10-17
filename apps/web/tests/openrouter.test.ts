import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { completeWithOpenRouter, DEFAULT_FREE_CHAT_MODEL, selectedFreeChatModel } from "../src/lib/server/openrouter-chat";

const oldKey = process.env.OPENROUTER_API_KEY;
const oldModel = process.env.OPENROUTER_CHAT_MODEL;

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.OPENROUTER_CHAT_MODEL;
});

afterEach(() => {
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = oldKey;
  if (oldModel === undefined) delete process.env.OPENROUTER_CHAT_MODEL;
  else process.env.OPENROUTER_CHAT_MODEL = oldModel;
});

describe("free OpenRouter chat client", () => {
  test("uses a free model by default and returns text only", async () => {
    let requestBody: Record<string, unknown> = {};
    const content = await completeWithOpenRouter({
      messages: [{ role: "user", content: "Test" }],
      fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ choices: [{ message: { content: "  Hello from a free model.  " } }] });
      },
    });
    expect(requestBody.model).toBe(DEFAULT_FREE_CHAT_MODEL);
    expect(content).toBe("Hello from a free model.");
  });

  test("rejects a configured paid model and falls back on provider errors", async () => {
    process.env.OPENROUTER_CHAT_MODEL = "openai/gpt-4o";
    expect(selectedFreeChatModel()).toBe(DEFAULT_FREE_CHAT_MODEL);
    process.env.OPENROUTER_CHAT_MODEL = "google/gemma-4-31b-it:free";
    expect(selectedFreeChatModel()).toBe("google/gemma-4-31b-it:free");
    await expect(completeWithOpenRouter({ messages: [{ role: "user", content: "Test" }], fetcher: async () => new Response("", { status: 429 }) })).resolves.toBeNull();
  });

  test("accepts image pages only with a free vision model override", async () => {
    let body: Record<string, unknown> = {};
    await completeWithOpenRouter({
      model: "nvidia/nemotron-3.5-super-vl:free",
      messages: [{ role: "user", content: [{ type: "text", text: "Read this scan." }, { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] }],
      fetcher: async (_input, init) => { body = JSON.parse(String(init?.body)) as Record<string, unknown>; return Response.json({ choices: [{ message: { content: "{}" } }] }); },
    });
    expect(body.model).toBe("nvidia/nemotron-3.5-super-vl:free");
  });
});
