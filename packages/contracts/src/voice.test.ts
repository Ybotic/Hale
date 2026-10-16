import { describe, expect, test } from "bun:test";
import { encodeVoiceWav, validateVoiceWav, VOICE_SAMPLE_RATE } from "./voice";

const tone = (seconds: number, amplitude = .1) => Float32Array.from({ length: VOICE_SAMPLE_RATE * seconds }, (_, i) => Math.sin(i * 2 * Math.PI * 440 / VOICE_SAMPLE_RATE) * amplitude);

describe("voice enrollment WAV contract", () => {
  test("writes an actual mono PCM WAV with duration from decoded sample count", () => {
    const wav = encodeVoiceWav(tone(25));
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(wav.byteLength).toBe(800_044);
    expect(validateVoiceWav(wav).duration).toBe(25);
  });
  test("enforces the 10 second minimum and provider's 30 second maximum", () => {
    expect(() => validateVoiceWav(encodeVoiceWav(tone(9)))).toThrow("10 and 30");
    expect(() => validateVoiceWav(encodeVoiceWav(tone(31)))).toThrow("10 and 30");
    expect(validateVoiceWav(encodeVoiceWav(tone(30))).duration).toBe(30);
  });
  test("rejects silent, very quiet, and clipped samples", () => {
    expect(() => validateVoiceWav(encodeVoiceWav(tone(10, 0)))).toThrow("too quiet");
    expect(() => validateVoiceWav(encodeVoiceWav(tone(10, .001)))).toThrow("too quiet");
    expect(() => validateVoiceWav(encodeVoiceWav(new Float32Array(VOICE_SAMPLE_RATE * 10).fill(1)))).toThrow("too loud");
  });
  test("does not accept renamed media, spoofed lengths, stereo, or another sample rate", () => {
    expect(() => validateVoiceWav(new TextEncoder().encode("not an actual WAV").buffer)).toThrow();
    for (const [offset, value] of [[22, 2], [24, 48_000], [40, 2]]) {
      const wav = encodeVoiceWav(tone(10));
      const view = new DataView(wav);
      if (offset === 22) view.setUint16(offset, value, true); else view.setUint32(offset, value, true);
      expect(() => validateVoiceWav(wav)).toThrow("PCM WAV");
    }
  });
});
