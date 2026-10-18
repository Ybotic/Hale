import { describe, expect, it } from "bun:test";
import { conversationTitleFromTranscript, conversationTitleFromTurns } from "./conversation-title";

describe("conversation titles from transcript text", () => {
  it("skips a greeting and uses the first substantive transcript sentence", () => {
    expect(conversationTitleFromTranscript("Hello. I went to the garden café with Grace today.")).toBe("I went to the garden café with Grace today");
  });

  it("uses a transcript question as a concise title", () => {
    expect(conversationTitleFromTurns([{ text: "Where did I leave my keys?" }])).toBe("Where did I leave my keys");
  });

  it("trims long titles without changing their source wording", () => {
    expect(conversationTitleFromTranscript("We went to the garden with our old dog and sat by the fountain.")).toBe("We went to the garden with our old…");
  });

  it("returns no title for empty or greeting-only transcripts", () => {
    expect(conversationTitleFromTranscript("  ")).toBeUndefined();
    expect(conversationTitleFromTranscript("Hello! How are you?")).toBeUndefined();
  });
});
