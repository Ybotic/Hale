// pyannoteAI voiceprints accept a single speaker and at most 30 seconds.
export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MIN_SECONDS = 10;
export const VOICE_TARGET_SECONDS = 25;
export const VOICE_MAX_SECONDS = 30;
export const VOICE_MAX_BYTES = 44 + VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS * 2;
export const VOICE_POLICY = "voice-2026-10-15-v1";

export type VoiceState = "not_enrolled" | "skipped" | "queued" | "processing" | "enrolled" | "failed" | "revoked";

/** A real PCM WAV container, not a renamed MediaRecorder blob. */
export function encodeVoiceWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => {
    const clamped = Math.max(-1, Math.min(1, value));
    view.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  });
  return buffer;
}

/** Validate decoded duration and basic levels again on the server. Not a speaker/noise classifier. */
export function validateVoiceWav(buffer: ArrayBuffer) {
  if (buffer.byteLength < 44 || buffer.byteLength > VOICE_MAX_BYTES) throw new Error("Record between 10 and 30 seconds of audio.");
  const view = new DataView(buffer);
  const text = (offset: number, length: number) => String.fromCharCode(...new Uint8Array(buffer, offset, length));
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE" || text(12, 4) !== "fmt " || text(36, 4) !== "data"
    || view.getUint32(4, true) !== buffer.byteLength - 8 || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1
    || view.getUint32(24, true) !== VOICE_SAMPLE_RATE || view.getUint32(28, true) !== VOICE_SAMPLE_RATE * 2
    || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16
    || view.getUint32(40, true) !== buffer.byteLength - 44 || (buffer.byteLength - 44) % 2) {
    throw new Error("This sample must be a mono, 16 kHz PCM WAV recording. Please record again.");
  }
  const count = (buffer.byteLength - 44) / 2;
  const duration = count / VOICE_SAMPLE_RATE;
  if (duration < VOICE_MIN_SECONDS || duration > VOICE_MAX_SECONDS) throw new Error("Record between 10 and 30 seconds of audio.");
  let energy = 0, clipped = 0;
  for (let i = 0; i < count; i++) {
    const sample = view.getInt16(44 + i * 2, true) / 32768;
    energy += sample * sample;
    if (Math.abs(sample) > 0.99) clipped++;
  }
  if (Math.sqrt(energy / count) < 0.005) throw new Error("The sample is too quiet. Move closer to your microphone and try again.");
  if (clipped / count > 0.05) throw new Error("The sample is too loud. Move a little further from your microphone and try again.");
  return { duration };
}
