import { describe, expect, test } from "bun:test";
import {
  isSarvamLanguageCode,
  SARVAM_CHAT_CODES,
  SARVAM_LANGUAGES,
  SARVAM_SPEECH_TO_TEXT_CODES,
  SARVAM_TEXT_TO_SPEECH_CODES,
  SARVAM_TRANSLATION_CODES,
  supportsSarvamChat,
  supportsSarvamTextToSpeech,
} from "./languages";

describe("Sarvam language capabilities", () => {
  test("lists every documented Saaras and Sarvam Translate language exactly once", () => {
    expect(SARVAM_LANGUAGES).toHaveLength(23);
    expect(new Set(SARVAM_SPEECH_TO_TEXT_CODES).size).toBe(23);
    expect(SARVAM_TRANSLATION_CODES).toEqual(SARVAM_SPEECH_TO_TEXT_CODES);
    expect(SARVAM_LANGUAGES.filter(({ code }) => code !== "en-IN")).toHaveLength(22);
  });

  test("records narrower chat and speech synthesis coverage instead of implying parity", () => {
    expect(SARVAM_CHAT_CODES).toHaveLength(11);
    expect(SARVAM_TEXT_TO_SPEECH_CODES).toEqual(SARVAM_CHAT_CODES);
    expect(supportsSarvamTextToSpeech("ml-IN")).toBe(true);
    expect(supportsSarvamTextToSpeech("od-IN")).toBe(true);
    expect(supportsSarvamChat("as-IN")).toBe(false);
    expect(supportsSarvamTextToSpeech("as-IN")).toBe(false);
  });

  test("validates provider language codes", () => {
    expect(isSarvamLanguageCode("ta-IN")).toBe(true);
    expect(isSarvamLanguageCode("xx-IN")).toBe(false);
  });
});
